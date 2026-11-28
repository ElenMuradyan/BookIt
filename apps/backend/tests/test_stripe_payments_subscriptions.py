import hashlib
import hmac
import json
import time
from datetime import timedelta

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.models.base import utc_now
from app.models.booking import Booking
from app.models.commerce import Invoice, Payment, Subscription
from tests.conftest import login_as


def _sign_stripe(payload_bytes: bytes, secret: str, *, timestamp: int | None = None) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    signed_payload = f"{ts}.".encode("utf-8") + payload_bytes
    sig = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


@pytest.mark.asyncio
async def test_stripe_intent_webhook_verification_and_subscription_lifecycle(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
):
    settings = get_settings()
    prev = (
        settings.payment_provider,
        settings.stripe_secret_key,
        settings.stripe_webhook_secret,
        settings.stripe_publishable_key,
        settings.stripe_api_base_url,
    )
    settings.payment_provider = "stripe"
    settings.stripe_secret_key = "sk_test_mock_bookit"
    settings.stripe_webhook_secret = "whsec_test_mock_bookit"
    settings.stripe_publishable_key = "pk_test_mock_bookit"
    settings.stripe_api_base_url = "https://api.stripe.com"

    stripe_calls: list[dict] = []
    original_post = httpx.AsyncClient.post

    async def fake_stripe_post(self, url, *, headers=None, data=None, json=None, **kwargs):
        url_str = str(url)
        if url_str.startswith("https://api.stripe.com/v1/payment_intents"):
            stripe_calls.append({"url": url_str, "headers": dict(headers or {}), "data": dict(data or {})})
            return httpx.Response(
                200,
                json={"id": f"pi_test_{len(stripe_calls)}", "client_secret": f"pi_test_{len(stripe_calls)}_secret_123"},
                request=httpx.Request("POST", url_str),
            )
        if url_str.startswith("https://api.stripe.com/v1/refunds"):
            stripe_calls.append({"url": url_str, "headers": dict(headers or {}), "data": dict(data or {})})
            return httpx.Response(
                200,
                json={"id": f"re_test_{len(stripe_calls)}", "status": "succeeded"},
                request=httpx.Request("POST", url_str),
            )
        return await original_post(self, url, headers=headers, data=data, json=json, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_stripe_post)

    try:
        owner = await login_as(client, "business@bookit.demo")
        ho = {"Authorization": f"Bearer {owner['accessToken']}"}

        # 1. Renew subscription creates an open invoice + Stripe PaymentIntent
        renew_res = await client.post(
            "/api/v1/workspaces/biz_aura/subscription/renew",
            headers=ho,
            json={"planId": "enterprise", "method": "card_token_pending", "idempotencyKey": "idem_sub_renew_1"},
        )
        assert renew_res.status_code == 200, renew_res.text
        renew_body = renew_res.json()
        assert renew_body["invoice"]["status"] == "open"
        intent_body = renew_body["paymentIntent"]
        assert intent_body["provider"] == "stripe"
        assert intent_body["configured"] is True
        assert intent_body["publishableKey"] == "pk_test_mock_bookit"
        assert intent_body["clientSecret"].startswith("pi_test_")
        pay_id = intent_body["payment"]["id"]
        pi_id = intent_body["payment"]["providerReference"]
        assert stripe_calls[0]["headers"]["Idempotency-Key"] == "idem_sub_renew_1"

        # 2. Invalid or expired Stripe webhook signature must fail with 401
        succeeded_payload = json.dumps({
            "id": "evt_stripe_sub_ok_1",
            "type": "payment_intent.succeeded",
            "data": {
                "object": {
                    "id": pi_id,
                    "metadata": {"payment_id": pay_id},
                }
            },
        }).encode("utf-8")

        bad_sig = await client.post(
            "/api/v1/payments/webhooks/stripe",
            content=succeeded_payload,
            headers={"Content-Type": "application/json", "Stripe-Signature": "t=123,v1=invalid"},
        )
        assert bad_sig.status_code == 401

        expired_sig = _sign_stripe(
            succeeded_payload,
            "whsec_test_mock_bookit",
            timestamp=int(time.time()) - 600,
        )
        expired_wh = await client.post(
            "/api/v1/payments/webhooks/stripe",
            content=succeeded_payload,
            headers={"Content-Type": "application/json", "Stripe-Signature": expired_sig},
        )
        assert expired_wh.status_code == 401

        # 3. Valid Stripe webhook confirms subscription + invoice + payment idempotently
        valid_sig = _sign_stripe(succeeded_payload, "whsec_test_mock_bookit")
        good_wh = await client.post(
            "/api/v1/payments/webhooks/stripe",
            content=succeeded_payload,
            headers={"Content-Type": "application/json", "Stripe-Signature": valid_sig},
        )
        assert good_wh.status_code == 200, good_wh.text
        assert good_wh.json()["duplicate"] is False

        dup_wh = await client.post(
            "/api/v1/payments/webhooks/stripe",
            content=succeeded_payload,
            headers={"Content-Type": "application/json", "Stripe-Signature": valid_sig},
        )
        assert dup_wh.status_code == 200
        assert dup_wh.json()["duplicate"] is True

        sub_res = await client.get("/api/v1/workspaces/biz_aura/subscription", headers=ho)
        assert sub_res.status_code == 200
        assert sub_res.json()["status"] == "active"
        assert sub_res.json()["planId"] == "enterprise"

        async with session_factory() as db:
            inv = await db.get(Invoice, renew_body["invoice"]["id"])
            assert inv is not None and inv.status == "paid"
            pay = await db.get(Payment, pay_id)
            assert pay is not None and pay.status == "recorded"

        # 4. Partial + remaining refund enforces Stripe refund API & finance.manage RBAC
        cust = await login_as(client, "customer@bookit.demo")
        hc = {"Authorization": f"Bearer {cust['accessToken']}"}
        denied_refund = await client.post(
            f"/api/v1/payments/{pay_id}/refund",
            headers=hc,
            json={"amount": 20, "reason": "requested_by_customer"},
        )
        assert denied_refund.status_code == 403

        partial_refund = await client.post(
            f"/api/v1/payments/{pay_id}/refund",
            headers=ho,
            json={"amount": 25, "reason": "requested_by_customer"},
        )
        assert partial_refund.status_code == 200, partial_refund.text
        assert partial_refund.json()["status"] == "recorded"
        assert "Partially refunded" in (partial_refund.json()["note"] or "")

        full_refund = await client.post(
            f"/api/v1/payments/{pay_id}/refund",
            headers=ho,
            json={"reason": "requested_by_customer"},
        )
        assert full_refund.status_code == 200, full_refund.text
        assert full_refund.json()["status"] == "refunded"

        # 5. Cancel subscription transitions status cleanly
        cancel_res = await client.post(
            "/api/v1/workspaces/biz_aura/subscription/cancel",
            headers=ho,
            json={"reason": "Seasonal pause", "immediate": True},
        )
        assert cancel_res.status_code == 200, cancel_res.text
        assert cancel_res.json()["status"] == "canceled"

        # 6. Live key outside production must fail safely
        settings.stripe_secret_key = "sk_live_forbidden_in_test"
        live_blocked = await client.post(
            "/api/v1/workspaces/biz_aura/subscription/renew",
            headers=ho,
            json={"planId": "professional", "method": "card_token_pending", "idempotencyKey": "idem_live_guard"},
        )
        assert live_blocked.status_code == 400
        assert "forbidden" in live_blocked.json()["detail"].lower()
    finally:
        (
            settings.payment_provider,
            settings.stripe_secret_key,
            settings.stripe_webhook_secret,
            settings.stripe_publishable_key,
            settings.stripe_api_base_url,
        ) = prev


@pytest.mark.asyncio
async def test_stripe_payment_failed_marks_subscription_past_due_and_handles_502(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
):
    settings = get_settings()
    prev = (
        settings.payment_provider,
        settings.stripe_secret_key,
        settings.stripe_webhook_secret,
        settings.stripe_publishable_key,
        settings.stripe_api_base_url,
    )
    settings.payment_provider = "stripe"
    settings.stripe_secret_key = "sk_test_mock_bookit"
    settings.stripe_webhook_secret = "whsec_test_mock_bookit"
    settings.stripe_publishable_key = "pk_test_mock_bookit"
    settings.stripe_api_base_url = "https://api.stripe.com"

    should_fail = {"flag": False}
    original_post = httpx.AsyncClient.post

    async def fake_stripe_post(self, url, *, headers=None, data=None, json=None, **kwargs):
        url_str = str(url)
        if url_str.startswith("https://api.stripe.com/v1/payment_intents"):
            if should_fail["flag"]:
                return httpx.Response(
                    502,
                    json={"error": {"message": "Upstream Stripe gateway timeout"}},
                    request=httpx.Request("POST", url_str),
                )
            return httpx.Response(
                200,
                json={"id": "pi_fail_test_1", "client_secret": "pi_fail_test_1_secret"},
                request=httpx.Request("POST", url_str),
            )
        return await original_post(self, url, headers=headers, data=data, json=json, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_stripe_post)

    try:
        owner = await login_as(client, "business@bookit.demo")
        ho = {"Authorization": f"Bearer {owner['accessToken']}"}

        # Expired trial transitions automatically to past_due on GET subscription
        async with session_factory() as db:
            sub = (await db.execute(select(Subscription).where(Subscription.business_id == "biz_aura"))).scalar_one()
            sub.status = "trialing"
            sub.trial_ends_at = utc_now() - timedelta(days=2)
            await db.commit()

        expired_sub = await client.get("/api/v1/workspaces/biz_aura/subscription", headers=ho)
        assert expired_sub.status_code == 200
        assert expired_sub.json()["status"] == "past_due"

        # Renew starts pending Stripe payment intent
        renew = await client.post(
            "/api/v1/workspaces/biz_aura/subscription/renew",
            headers=ho,
            json={"method": "card_token_pending", "idempotencyKey": "idem_sub_fail_case"},
        )
        assert renew.status_code == 200, renew.text
        pay_id = renew.json()["paymentIntent"]["payment"]["id"]

        # Stripe webhook reports payment_intent.payment_failed -> payment failed & sub past_due
        fail_payload = json.dumps({
            "id": "evt_stripe_fail_1",
            "type": "payment_intent.payment_failed",
            "data": {
                "object": {
                    "id": "pi_fail_test_1",
                    "metadata": {"payment_id": pay_id},
                    "last_payment_error": {"message": "Your card was declined."},
                }
            },
        }).encode("utf-8")
        wh_fail = await client.post(
            "/api/v1/payments/webhooks/stripe",
            content=fail_payload,
            headers={
                "Content-Type": "application/json",
                "Stripe-Signature": _sign_stripe(fail_payload, "whsec_test_mock_bookit"),
            },
        )
        assert wh_fail.status_code == 200

        async with session_factory() as db:
            pay = await db.get(Payment, pay_id)
            sub = (await db.execute(select(Subscription).where(Subscription.business_id == "biz_aura"))).scalar_one()
            assert pay is not None and pay.status == "failed"
            assert "declined" in (pay.note or "").lower()
            assert sub.status == "past_due"

        # Upstream Stripe failure returns HTTP 502 cleanly
        should_fail["flag"] = True
        cust = await login_as(client, "customer@bookit.demo")
        hc = {"Authorization": f"Bearer {cust['accessToken']}"}
        bk = await client.post(
            "/api/v1/bookings/universal",
            headers=hc,
            json={
                "bookingModel": "ticket",
                "businessId": "biz_aura",
                "sessionId": "ses_aura_live_1",
                "tickets": [{"tierId": "tier_aura_ga", "quantity": 1}],
                "paymentMethod": "card_token_pending",
                "holdOnly": True,
            },
        )
        assert bk.status_code == 201
        gateway_err = await client.post(
            "/api/v1/payments/intents",
            headers=hc,
            json={
                "referenceType": "booking",
                "referenceId": bk.json()["id"],
                "method": "card_token_pending",
                "idempotencyKey": "idem_502_test",
            },
        )
        assert gateway_err.status_code == 502
        assert "Upstream Stripe gateway timeout" in gateway_err.json()["detail"]

        # Booking settlement via Stripe webhook + business payment ledger query (finance.view RBAC)
        should_fail["flag"] = False
        ok_intent = await client.post(
            "/api/v1/payments/intents",
            headers=hc,
            json={
                "referenceType": "booking",
                "referenceId": bk.json()["id"],
                "method": "card_token_pending",
                "idempotencyKey": "idem_bk_stripe_ok",
            },
        )
        assert ok_intent.status_code == 201
        bk_pay_id = ok_intent.json()["payment"]["id"]

        ok_payload = json.dumps({
            "id": "evt_stripe_bk_ok_1",
            "type": "payment_intent.succeeded",
            "data": {"object": {"id": "pi_fail_test_1", "metadata": {"payment_id": bk_pay_id}}},
        }).encode("utf-8")
        wh_ok = await client.post(
            "/api/v1/payments/webhooks/stripe",
            content=ok_payload,
            headers={
                "Content-Type": "application/json",
                "Stripe-Signature": _sign_stripe(ok_payload, "whsec_test_mock_bookit"),
            },
        )
        assert wh_ok.status_code == 200

        async with session_factory() as db:
            settled_bk = await db.get(Booking, bk.json()["id"])
            assert settled_bk is not None
            assert settled_bk.status == "confirmed"
            assert settled_bk.payment_status == "paid"

        cust_forbidden_ledger = await client.get("/api/v1/payments?businessId=biz_aura", headers=hc)
        assert cust_forbidden_ledger.status_code == 403

        biz_ledger = await client.get("/api/v1/payments?businessId=biz_aura", headers=ho)
        assert biz_ledger.status_code == 200
        assert any(p["id"] == bk_pay_id and p["status"] == "recorded" for p in biz_ledger.json())
    finally:
        (
            settings.payment_provider,
            settings.stripe_secret_key,
            settings.stripe_webhook_secret,
            settings.stripe_publishable_key,
            settings.stripe_api_base_url,
        ) = prev
