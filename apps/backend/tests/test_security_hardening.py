import asyncio
import hashlib
import hmac
import json

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.rate_limit import auth_rate_limiter
from app.models.catalog import Product
from app.models.engagement import PromoCode
from tests.conftest import login_as


@pytest.mark.asyncio
async def test_logout_and_password_change_revoke_active_access_jwt(client: AsyncClient):
    # Shared non-unique phone across multiple seeded users must return 401/200 cleanly, never 500
    dup_phone_login = await client.post(
        "/api/v1/auth/login",
        json={"identifier": "+1 206 555 0100", "password": "Demo1234!"},
    )
    assert dup_phone_login.status_code == 401
    dup_phone_reset = await client.post(
        "/api/v1/auth/password-reset/request",
        json={"identifier": "+1 206 555 0100"},
    )
    assert dup_phone_reset.status_code == 200

    cust = await login_as(client, "customer@bookit.demo")
    access = cust["accessToken"]
    refresh = cust["refreshToken"]
    headers = {"Authorization": f"Bearer {access}"}

    me_before = await client.get("/api/v1/auth/me", headers=headers)
    assert me_before.status_code == 200

    # Logout must invalidate BOTH refresh token AND active access token bound to sid
    out = await client.post("/api/v1/auth/logout", json={"refreshToken": refresh})
    assert out.status_code == 200

    me_after_logout = await client.get("/api/v1/auth/me", headers=headers)
    assert me_after_logout.status_code == 401

    refresh_after_logout = await client.post("/api/v1/auth/refresh", json={"refreshToken": refresh})
    assert refresh_after_logout.status_code == 401

    # Fresh login, then change password -> old access token must fail immediately
    cust2 = await login_as(client, "customer@bookit.demo")
    h2 = {"Authorization": f"Bearer {cust2['accessToken']}"}
    chg = await client.post(
        "/api/v1/auth/change-password",
        headers=h2,
        json={
            "currentPassword": "Demo1234!",
            "newPassword": "NewStrongPassword9!",
            "confirmPassword": "NewStrongPassword9!",
        },
    )
    assert chg.status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=h2)).status_code == 401


@pytest.mark.asyncio
async def test_concurrent_refresh_race_allows_only_one_winner(client: AsyncClient):
    cust = await login_as(client, "customer@bookit.demo")
    refresh = cust["refreshToken"]

    r1, r2 = await asyncio.gather(
        client.post("/api/v1/auth/refresh", json={"refreshToken": refresh}),
        client.post("/api/v1/auth/refresh", json={"refreshToken": refresh}),
    )
    statuses = sorted([r1.status_code, r2.status_code])
    assert statuses == [200, 401], f"Expected [200, 401], got {[r1.status_code, r2.status_code]}"


@pytest.mark.asyncio
async def test_rate_limit_blocks_xff_spoofing_and_otp_brute_force(client: AsyncClient):
    settings = get_settings()
    old_max = settings.auth_rate_limit_max_attempts
    old_trust = settings.trust_proxy_headers
    settings.auth_rate_limit_max_attempts = 2
    settings.trust_proxy_headers = False
    await auth_rate_limiter.reset()
    try:
        # Rotating X-Forwarded-For must NOT bypass login rate limit when trust_proxy_headers=False
        for i in range(2):
            res = await client.post(
                "/api/v1/auth/login",
                headers={"X-Forwarded-For": f"203.0.113.{10 + i}"},
                json={"identifier": "customer@bookit.demo", "password": "WrongPassword1!"},
            )
            assert res.status_code == 401
        blocked = await client.post(
            "/api/v1/auth/login",
            headers={"X-Forwarded-For": "203.0.113.99"},
            json={"identifier": "customer@bookit.demo", "password": "WrongPassword1!"},
        )
        assert blocked.status_code == 429

        # OTP /verify also enforces rate limiting
        await auth_rate_limiter.reset()
        cust = await login_as(client, "customer@bookit.demo")
        h = {"Authorization": f"Bearer {cust['accessToken']}"}
        for _ in range(2):
            v = await client.post("/api/v1/auth/verify", headers=h, json={"code": "000000"})
            assert v.status_code == 400
        v_blocked = await client.post("/api/v1/auth/verify", headers=h, json={"code": "000000"})
        assert v_blocked.status_code == 429
    finally:
        settings.auth_rate_limit_max_attempts = old_max
        settings.trust_proxy_headers = old_trust
        await auth_rate_limiter.reset()


@pytest.mark.asyncio
async def test_unapproved_business_catalog_and_bootstrap_redaction(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
):
    # Create a service & product under unapproved biz_luxe (owned by sophia.bennett@bookit.demo)
    sophia = await login_as(client, "sophia.bennett@bookit.demo")
    sophia_h = {"Authorization": f"Bearer {sophia['accessToken']}"}
    svc_res = await client.post(
        "/api/v1/workspaces/biz_luxe/services",
        headers=sophia_h,
        json={
            "name": "Private Preview Facial",
            "description": "Hidden until approved",
            "category": "Skincare",
            "price": 120,
            "durationMinutes": 45,
            "cancellationPolicy": "24h notice",
        },
    )
    assert svc_res.status_code == 201
    hidden_svc_id = svc_res.json()["id"]

    async with session_factory() as db:
        db.add(
            Product(
                id="prd_luxe_hidden",
                business_id="biz_luxe",
                category_id="cat_beauty",
                name="Private Mask",
                description="Hidden product",
                price=45,
                image_url="https://example.com/mask.jpg",
                stock=10,
                active=True,
            )
        )
        await db.commit()

    # Unauthenticated & unrelated customer cannot enumerate biz_luxe services, staff, products, or availability
    cust = await login_as(client, "customer@bookit.demo")
    cust_h = {"Authorization": f"Bearer {cust['accessToken']}"}
    for headers in ({}, cust_h):
        assert (await client.get("/api/v1/businesses/biz_luxe/services", headers=headers)).status_code == 404
        assert (await client.get("/api/v1/businesses/biz_luxe/staff", headers=headers)).status_code == 404
        assert (
            await client.get(
                "/api/v1/businesses/biz_luxe/availability",
                headers=headers,
                params={"serviceId": hidden_svc_id, "date": "2026-11-23"},
            )
        ).status_code == 404
        assert (await client.get(f"/api/v1/services/{hidden_svc_id}", headers=headers)).status_code == 404
        assert (await client.get("/api/v1/products/prd_luxe_hidden", headers=headers)).status_code == 404

    assert (
        await client.post(
            "/api/v1/businesses/biz_luxe/messages",
            headers=cust_h,
            json={"body": "Can I message an unapproved venue?"},
        )
    ).status_code == 404

    # Owner of biz_luxe CAN still access their draft/under-review services
    assert (await client.get(f"/api/v1/services/{hidden_svc_id}", headers=sophia_h)).status_code == 200

    # Non-admin bootstrap redacts platformStats revenue/users/pending counts
    anon_boot = await client.get("/api/v1/bootstrap")
    assert anon_boot.status_code == 200
    assert anon_boot.json()["platformStats"]["platformRevenue"] == 0
    assert anon_boot.json()["platformStats"]["pendingApplications"] == 0
    assert anon_boot.json()["platformStats"]["totalUsers"] == 0

    admin = await login_as(client, "admin@bookit.demo")
    admin_boot = await client.get(
        "/api/v1/bootstrap",
        headers={"Authorization": f"Bearer {admin['accessToken']}"},
    )
    assert admin_boot.status_code == 200
    assert admin_boot.json()["platformStats"]["totalUsers"] >= 14


@pytest.mark.asyncio
async def test_booking_past_slot_blocked_reschedule_self_overlap_and_idempotency_race(client: AsyncClient):
    cust = await login_as(client, "customer@bookit.demo")
    h = {"Authorization": f"Bearer {cust['accessToken']}"}

    # Client cannot use ?enforceNotice=false to book a past slot
    past_res = await client.post(
        "/api/v1/bookings?enforceNotice=false",
        headers=h,
        json={
            "serviceId": "svc_signature",
            "employeeId": "emp_vance",
            "date": "2020-01-06",
            "time": "10:00",
            "paymentMethod": "in_person",
        },
    )
    assert past_res.status_code == 409

    # Concurrent requests with same idempotencyKey return same appointment cleanly
    idem_payload = {
        "serviceId": "svc_signature",
        "employeeId": "emp_vance",
        "date": "2026-11-24",
        "time": "14:00",
        "paymentMethod": "in_person",
        "idempotencyKey": "idem_race_test_001",
    }
    r1, r2 = await asyncio.gather(
        client.post("/api/v1/bookings", headers=h, json=idem_payload),
        client.post("/api/v1/bookings", headers=h, json=idem_payload),
    )
    assert r1.status_code == 201, r1.text
    assert r2.status_code == 201, r2.text
    assert r1.json()["id"] == r2.json()["id"]
    appt_id = r1.json()["id"]

    # Rescheduling 14:00-14:45 -> 14:30-15:15 (overlaps own slot) must succeed
    resched = await client.post(
        f"/api/v1/bookings/{appt_id}/reschedule",
        headers=h,
        json={"date": "2026-11-24", "time": "14:30"},
    )
    assert resched.status_code == 200, resched.text

    # Customer cannot self-check-in a pending (manual-approval) appointment at biz_opal
    opal_pending = await client.post(
        "/api/v1/bookings",
        headers=h,
        json={
            "serviceId": "svc_cleaning",
            "employeeId": "emp_noah",
            "date": "2026-11-24",
            "time": "09:00",
            "paymentMethod": "in_person",
        },
    )
    assert opal_pending.status_code == 201, opal_pending.text
    assert opal_pending.json()["status"] == "pending"
    pending_checkin = await client.post(
        "/api/v1/bookings/businesses/biz_opal/check-in",
        headers=h,
        json={"checkInCode": opal_pending.json()["checkInCode"]},
    )
    assert pending_checkin.status_code == 409


@pytest.mark.asyncio
async def test_cart_variant_stock_promo_expiry_rollback_and_order_transitions(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
):
    cust = await login_as(client, "customer@bookit.demo")
    cust_h = {"Authorization": f"Bearer {cust['accessToken']}"}

    # Add Studio Headphones Black variant (variant stock=14, product.stock=24)
    add_var = await client.post(
        "/api/v1/cart/items",
        headers=cust_h,
        json={"productId": "prd_headphones", "variantId": "var_hp_black", "quantity": 1},
    )
    assert add_var.status_code == 200
    var_item = next(i for i in add_var.json()["items"] if i["variantId"] == "var_hp_black")

    # Updating quantity to 15 must fail because variant stock is 14 (even though product.stock is 24)
    over_var = await client.patch(
        f"/api/v1/cart/items/{var_item['id']}",
        headers=cust_h,
        json={"quantity": 15},
    )
    assert over_var.status_code == 409

    # Add expired promo for biz_circuit and verify checkout ignores expired promo
    async with session_factory() as db:
        db.add(
            PromoCode(
                id="promo_expired_circuit",
                business_id="biz_circuit",
                code="EXPIRED50",
                percent_off=50,
                active=True,
                expires_on="2020-01-01",
                redemptions=0,
            )
        )
        await db.commit()

    # Make prd_throw out of stock (0) right before checkout while prd_charger is in stock (80)
    # Seeded cart has prd_throw (qty 1) and prd_charger (qty 2) -> checkout must roll back cleanly
    owner_hearth = await login_as(client, "chloe.kim@bookit.demo")
    await client.patch(
        "/api/v1/workspaces/biz_hearth/products/prd_throw/active",
        headers={"Authorization": f"Bearer {owner_hearth['accessToken']}"},
        json={"active": False},
    )
    failed_chk = await client.post(
        "/api/v1/checkout",
        headers=cust_h,
        json={
            "addressId": "addr_elena_home",
            "deliveryMethod": "pickup",
            "paymentMethod": "in_person",
            "promoCode": "EXPIRED50",
        },
    )
    assert failed_chk.status_code == 409
    # Variant stock must NOT have been decremented because transaction rolled back
    hp_after_fail = await client.get("/api/v1/products/prd_headphones")
    blk_after = next(v for v in hp_after_fail.json()["variants"] if v["id"] == "var_hp_black")
    assert blk_after["stock"] == 14

    # Remove unavailable item, then complete checkout with expired promo -> no discount applied
    throw_item = next(i for i in add_var.json()["items"] if i["productId"] == "prd_throw")
    await client.patch(f"/api/v1/cart/items/{throw_item['id']}", headers=cust_h, json={"quantity": 0})
    ok_chk = await client.post(
        "/api/v1/checkout",
        headers=cust_h,
        json={
            "addressId": "addr_elena_home",
            "deliveryMethod": "pickup",
            "paymentMethod": "in_person",
            "promoCode": "EXPIRED50",
        },
    )
    assert ok_chk.status_code == 201, ok_chk.text
    order_id = ok_chk.json()["orderIds"][0]
    orders = (await client.get("/api/v1/orders", headers=cust_h)).json()
    placed = next(o for o in orders if o["id"] == order_id)
    # 2x charger ($48 * 2 = 96) + 1x headphones ($189) = $285.00 (no 50% discount from expired promo)
    assert placed["subtotal"] == 285.0

    # Seller cannot move completed order back to pending
    seller_circuit = await login_as(client, "david.miller@bookit.demo")
    sh = {"Authorization": f"Bearer {seller_circuit['accessToken']}"}
    comp = await client.patch(
        f"/api/v1/workspaces/biz_circuit/orders/{order_id}",
        headers=sh,
        json={"status": "completed"},
    )
    assert comp.status_code == 200
    regress = await client.patch(
        f"/api/v1/workspaces/biz_circuit/orders/{order_id}",
        headers=sh,
        json={"status": "pending"},
    )
    assert regress.status_code == 409


@pytest.mark.asyncio
async def test_review_idor_moderation_recalculates_rating_admin_suspension_and_webhook_order(client: AsyncClient):
    cust = await login_as(client, "customer@bookit.demo")
    cust_h = {"Authorization": f"Bearer {cust['accessToken']}"}
    liam = await login_as(client, "liam.patel@bookit.demo")
    liam_h = {"Authorization": f"Bearer {liam['accessToken']}"}
    admin = await login_as(client, "admin@bookit.demo")
    admin_h = {"Authorization": f"Bearer {admin['accessToken']}"}
    owner = await login_as(client, "business@bookit.demo")
    owner_h = {"Authorization": f"Bearer {owner['accessToken']}"}

    # Customer cannot attach someone else's or unrelated appointment to a review (apt_elena_upcoming belongs to usr_elena)
    idor_rev = await client.post(
        "/api/v1/reviews",
        headers=liam_h,
        json={
            "businessId": "biz_aura",
            "appointmentId": "apt_elena_upcoming",
            "rating": 1,
            "title": "Hijacked",
            "body": "Trying to attach someone else's appointment",
        },
    )
    assert idor_rev.status_code == 403

    # Note targeting nonexistent user returns 404 (not 500)
    bad_note = await client.post(
        "/api/v1/workspaces/biz_aura/notes",
        headers=owner_h,
        json={"customerId": "usr_does_not_exist", "body": "Note body"},
    )
    assert bad_note.status_code == 404

    # Publish a 1-star review on biz_aura, then admin hides it -> rating must recalculate back to 5.0
    rev_res = await client.post(
        "/api/v1/reviews",
        headers=cust_h,
        json={
            "businessId": "biz_aura",
            "rating": 1,
            "title": "Test rating impact",
            "body": "Temporary low rating to verify recalculation",
        },
    )
    assert rev_res.status_code == 201
    rev_id = rev_res.json()["id"]
    biz_after_add = (await client.get("/api/v1/businesses/biz_aura")).json()
    assert biz_after_add["reviewCount"] == 2
    assert biz_after_add["rating"] == 3.0

    mod = await client.patch(
        f"/api/v1/admin/reviews/{rev_id}",
        headers=admin_h,
        json={"status": "hidden"},
    )
    assert mod.status_code == 200
    biz_after_hide = (await client.get("/api/v1/businesses/biz_aura")).json()
    assert biz_after_hide["reviewCount"] == 1
    assert biz_after_hide["rating"] == 5.0

    # Admin suspending a user revokes their active session immediately
    susp = await client.patch(
        "/api/v1/admin/users/usr_liam",
        headers=admin_h,
        json={"status": "suspended"},
    )
    assert susp.status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=liam_h)).status_code == 401
    assert (
        await client.post("/api/v1/auth/refresh", json={"refreshToken": liam["refreshToken"]})
    ).status_code in (401, 403)

    # Concurrent duplicate payment webhook + out-of-order protection after refund
    intent = await client.post(
        "/api/v1/payments/intents",
        headers=cust_h,
        json={
            "referenceType": "appointment",
            "referenceId": "apt_elena_upcoming",
            "method": "card_token_pending",
            "idempotencyKey": "idem_wh_race_1",
        },
    )
    assert intent.status_code == 201
    pay_id = intent.json()["payment"]["id"]

    secret = get_settings().payment_webhook_secret
    refund_body = json.dumps({
        "eventId": "evt_refund_first",
        "eventType": "payment.refunded",
        "paymentId": pay_id,
    }).encode("utf-8")
    refund_sig = hmac.new(secret.encode("utf-8"), refund_body, hashlib.sha256).hexdigest()

    wh1, wh2 = await asyncio.gather(
        client.post(
            "/api/v1/payments/webhooks/sandbox",
            content=refund_body,
            headers={"Content-Type": "application/json", "X-BookIt-Signature": f"sha256={refund_sig}"},
        ),
        client.post(
            "/api/v1/payments/webhooks/sandbox",
            content=refund_body,
            headers={"Content-Type": "application/json", "X-BookIt-Signature": f"sha256={refund_sig}"},
        ),
    )
    assert wh1.status_code == 200 and wh2.status_code == 200
    assert sorted([wh1.json()["duplicate"], wh2.json()["duplicate"]]) == [False, True]

    # Out-of-order succeeded event must not overwrite refunded status
    late_body = json.dumps({
        "eventId": "evt_late_succeed",
        "eventType": "payment.succeeded",
        "paymentId": pay_id,
    }).encode("utf-8")
    late_sig = hmac.new(secret.encode("utf-8"), late_body, hashlib.sha256).hexdigest()
    late_res = await client.post(
        "/api/v1/payments/webhooks/sandbox",
        content=late_body,
        headers={"Content-Type": "application/json", "X-BookIt-Signature": f"sha256={late_sig}"},
    )
    assert late_res.status_code == 200
    my_payments = (await client.get("/api/v1/payments", headers=cust_h)).json()
    target_pay = next(p for p in my_payments if p["id"] == pay_id)
    assert target_pay["status"] == "refunded"
