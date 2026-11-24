import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.business import Business, BusinessApplication, Membership
from app.models.commerce import Cart
from app.models.engagement import Notification
from app.models.user import CustomerProfile, User
from tests.conftest import login_as


def _application_payload(
    *,
    owner_email: str,
    owner_password: str | None = "StrongOwnerPass1!",
    owner_confirm_password: str | None = "StrongOwnerPass1!",
) -> dict:
    payload: dict = {
        "businessName": "Cascade Sound Studio",
        "legalName": "Cascade Sound Studio LLC",
        "category": "beauty",
        "country": "United States",
        "city": "Seattle",
        "address": "1205 Western Ave",
        "phone": "+1 206 555 0188",
        "email": "hello@example.com",
        "website": "",
        "description": "Boutique studio offering custom sound and beauty treatments by appointment.",
        "ownerName": "Taylor Brooks",
        "ownerEmail": owner_email,
        "ownerPhone": "+1 206 555 0189",
    }
    if owner_password is not None:
        payload["ownerPassword"] = owner_password
    if owner_confirm_password is not None:
        payload["ownerConfirmPassword"] = owner_confirm_password
    return payload


@pytest.mark.asyncio
async def test_submit_business_application_new_owner_creates_user_profile_cart_and_business(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
):
    res = await client.post(
        "/api/v1/businesses/applications",
        json=_application_payload(owner_email="new.owner@example.com"),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "submitted"
    business_id = body["businessId"]
    owner_id = body["applicantUserId"]

    async with session_factory() as db:
        owner = await db.get(User, owner_id)
        assert owner is not None
        assert owner.email == "new.owner@example.com"

        profile = await db.get(CustomerProfile, owner_id)
        assert profile is not None

        cart = (await db.execute(select(Cart).where(Cart.user_id == owner_id))).scalar_one_or_none()
        assert cart is not None

        business = await db.get(Business, business_id)
        assert business is not None
        assert business.owner_user_id == owner_id
        assert business.status == "submitted"
        assert business.is_public is False

        application = await db.get(BusinessApplication, body["id"])
        assert application is not None
        assert application.business_id == business_id
        assert application.applicant_user_id == owner_id

        membership = (
            await db.execute(
                select(Membership).where(
                    Membership.user_id == owner_id,
                    Membership.business_id == business_id,
                )
            )
        ).scalar_one_or_none()
        assert membership is not None
        assert membership.role == "owner"
        assert membership.status == "active"

        notification = (
            await db.execute(
                select(Notification).where(
                    Notification.user_id == owner_id,
                    Notification.business_id == business_id,
                )
            )
        ).scalar_one_or_none()
        assert notification is not None

    # Newly created owner can sign in to the business workspace immediately
    login_res = await client.post(
        "/api/v1/auth/login/business",
        json={
            "identifier": "new.owner@example.com",
            "password": "StrongOwnerPass1!",
            "remember": True,
        },
    )
    assert login_res.status_code == 200, login_res.text
    assert login_res.json()["userId"] == owner_id
    assert any(ws["businessId"] == business_id for ws in login_res.json()["workspaces"])


@pytest.mark.asyncio
async def test_submit_business_application_existing_email_unauthenticated_requires_sign_in(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
):
    async with session_factory() as db:
        users_before = int((await db.execute(select(func.count(User.id)))).scalar_one())
        biz_before = int((await db.execute(select(func.count(Business.id)))).scalar_one())

    for payload in (
        _application_payload(owner_email="customer@bookit.demo"),
        _application_payload(
            owner_email="CUSTOMER@BOOKIT.DEMO",
            owner_password="",
            owner_confirm_password="",
        ),
    ):
        res = await client.post("/api/v1/businesses/applications", json=payload)
        assert res.status_code == 401, res.text
        assert "sign in first" in res.json()["detail"].lower()

    async with session_factory() as db:
        users_after = int((await db.execute(select(func.count(User.id)))).scalar_one())
        biz_after = int((await db.execute(select(func.count(Business.id)))).scalar_one())
        assert users_after == users_before
        assert biz_after == biz_before


@pytest.mark.asyncio
async def test_submit_business_application_authenticated_user_uses_existing_account(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
):
    # Test cookie-authenticated web flow with CSRF token + existing account without password
    login_res = await client.post(
        "/api/v1/auth/login",
        headers={"X-Client-Type": "web"},
        json={"identifier": "customer@bookit.demo", "password": "Demo1234!", "remember": True},
    )
    assert login_res.status_code == 200, login_res.text
    csrf_token = client.cookies.get("bookit_csrf")
    assert csrf_token

    async with session_factory() as db:
        users_before = int((await db.execute(select(func.count(User.id)))).scalar_one())

    # Cookie request without CSRF must be rejected with 403
    no_csrf = await client.post(
        "/api/v1/businesses/applications",
        json=_application_payload(
            owner_email="customer@bookit.demo",
            owner_password="",
            owner_confirm_password="",
        ),
    )
    assert no_csrf.status_code == 403

    res = await client.post(
        "/api/v1/businesses/applications",
        headers={"X-CSRF-Token": csrf_token},
        json=_application_payload(
            owner_email="customer@bookit.demo",
            owner_password="",
            owner_confirm_password="",
        ),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["applicantUserId"] == "usr_elena"
    business_id = body["businessId"]

    async with session_factory() as db:
        users_after = int((await db.execute(select(func.count(User.id)))).scalar_one())
        assert users_after == users_before

        business = await db.get(Business, business_id)
        assert business is not None
        assert business.owner_user_id == "usr_elena"

        membership = (
            await db.execute(
                select(Membership).where(
                    Membership.user_id == "usr_elena",
                    Membership.business_id == business_id,
                )
            )
        ).scalar_one_or_none()
        assert membership is not None
        assert membership.role == "owner"

    # Also verify Bearer-authenticated submission succeeds without CSRF
    client.cookies.clear()
    liam = await login_as(client, "liam.patel@bookit.demo")
    bearer_res = await client.post(
        "/api/v1/businesses/applications",
        headers={"Authorization": f"Bearer {liam['accessToken']}"},
        json=_application_payload(
            owner_email="different.form.email@example.com",
            owner_password="",
            owner_confirm_password="",
        ),
    )
    assert bearer_res.status_code == 201, bearer_res.text
    # Must bind to authenticated user identity, not unverified form ownerEmail
    assert bearer_res.json()["applicantUserId"] == "usr_liam"


@pytest.mark.asyncio
async def test_submit_business_application_validates_owner_password_and_avoids_orphan_records(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
):
    async with session_factory() as db:
        users_before = int((await db.execute(select(func.count(User.id)))).scalar_one())
        carts_before = int((await db.execute(select(func.count(Cart.id)))).scalar_one())
        profiles_before = int((await db.execute(select(func.count(CustomerProfile.user_id)))).scalar_one())
        biz_before = int((await db.execute(select(func.count(Business.id)))).scalar_one())

    missing_pw = await client.post(
        "/api/v1/businesses/applications",
        json=_application_payload(
            owner_email="missing.pw@example.com",
            owner_password="",
            owner_confirm_password="",
        ),
    )
    assert missing_pw.status_code == 422, missing_pw.text
    assert "password" in missing_pw.json()["detail"].lower()

    mismatch_pw = await client.post(
        "/api/v1/businesses/applications",
        json=_application_payload(
            owner_email="mismatch.pw@example.com",
            owner_password="StrongOwnerPass1!",
            owner_confirm_password="DifferentPass1!",
        ),
    )
    assert mismatch_pw.status_code == 422, mismatch_pw.text
    assert "match" in mismatch_pw.json()["detail"].lower()

    weak_pw = await client.post(
        "/api/v1/businesses/applications",
        json=_application_payload(
            owner_email="weak.pw@example.com",
            owner_password="weak",
            owner_confirm_password="weak",
        ),
    )
    assert weak_pw.status_code == 422, weak_pw.text
    assert "8 characters" in weak_pw.json()["detail"].lower()

    async with session_factory() as db:
        assert int((await db.execute(select(func.count(User.id)))).scalar_one()) == users_before
        assert int((await db.execute(select(func.count(Cart.id)))).scalar_one()) == carts_before
        assert int((await db.execute(select(func.count(CustomerProfile.user_id)))).scalar_one()) == profiles_before
        assert int((await db.execute(select(func.count(Business.id)))).scalar_one()) == biz_before


@pytest.mark.asyncio
async def test_submit_business_application_duplicate_unauthenticated_submission_requires_sign_in(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
):
    first = await client.post(
        "/api/v1/businesses/applications",
        json=_application_payload(owner_email="repeat.owner@example.com"),
    )
    assert first.status_code == 201, first.text

    async with session_factory() as db:
        users_after_first = int((await db.execute(select(func.count(User.id)))).scalar_one())
        carts_after_first = int((await db.execute(select(func.count(Cart.id)))).scalar_one())
        profiles_after_first = int((await db.execute(select(func.count(CustomerProfile.user_id)))).scalar_one())
        biz_after_first = int((await db.execute(select(func.count(Business.id)))).scalar_one())

    second = await client.post(
        "/api/v1/businesses/applications",
        json=_application_payload(owner_email="repeat.owner@example.com"),
    )
    assert second.status_code == 401, second.text
    assert "sign in first" in second.json()["detail"].lower()

    async with session_factory() as db:
        assert int((await db.execute(select(func.count(User.id)))).scalar_one()) == users_after_first
        assert int((await db.execute(select(func.count(Cart.id)))).scalar_one()) == carts_after_first
        assert int((await db.execute(select(func.count(CustomerProfile.user_id)))).scalar_one()) == profiles_after_first
        assert int((await db.execute(select(func.count(Business.id)))).scalar_one()) == biz_after_first


@pytest.mark.asyncio
async def test_submit_business_application_seeds_category_configs_and_issues_owner_verification(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
):
    from app.models.booking import BusinessBookingConfig
    from app.models.user import VerificationToken
    from app.services.notification_service import clear_test_email_outbox, get_test_email_outbox

    clear_test_email_outbox()
    try:
        rest_payload = _application_payload(owner_email="bistro.owner@example.com")
        rest_payload["businessName"] = "Cedar & Hearth Bistro"
        rest_payload["legalName"] = "Cedar & Hearth Bistro LLC"
        rest_payload["category"] = "restaurant"

        rest_res = await client.post("/api/v1/businesses/applications", json=rest_payload)
        assert rest_res.status_code == 201, rest_res.text
        rest_body = rest_res.json()
        assert "verificationCode" not in rest_body
        assert "token" not in rest_body

        hotel_payload = _application_payload(owner_email="inn.owner@example.com")
        hotel_payload["businessName"] = "Soundview Boutique Inn"
        hotel_payload["legalName"] = "Soundview Boutique Inn LLC"
        hotel_payload["category"] = "hotel"

        hotel_res = await client.post("/api/v1/businesses/applications", json=hotel_payload)
        assert hotel_res.status_code == 201, hotel_res.text

        outbox = get_test_email_outbox()
        assert len(outbox) == 2
        assert {msg.to_email for msg in outbox} == {"bistro.owner@example.com", "inn.owner@example.com"}

        async with session_factory() as db:
            rest_cfgs = (
                await db.execute(
                    select(BusinessBookingConfig).where(BusinessBookingConfig.business_id == rest_body["businessId"])
                )
            ).scalars().all()
            by_model_rest = {c.booking_model: c for c in rest_cfgs}
            assert "resource" in by_model_rest and by_model_rest["resource"].enabled is True
            assert by_model_rest["resource"].settings.get("slotIntervalMinutes") == 30
            assert "Main Dining" in (by_model_rest["resource"].settings.get("seatingAreas") or [])
            assert by_model_rest["appointment"].enabled is False

            hotel_cfgs = (
                await db.execute(
                    select(BusinessBookingConfig).where(
                        BusinessBookingConfig.business_id == hotel_res.json()["businessId"]
                    )
                )
            ).scalars().all()
            by_model_hotel = {c.booking_model: c for c in hotel_cfgs}
            assert "resource" in by_model_hotel and by_model_hotel["resource"].enabled is True
            assert by_model_hotel["resource"].settings.get("checkInTime") == "15:00"
            assert by_model_hotel["resource"].settings.get("checkOutTime") == "11:00"

            owner = await db.get(User, rest_body["applicantUserId"])
            assert owner is not None
            assert owner.email_verified is False

            tokens = (
                await db.execute(
                    select(VerificationToken).where(
                        VerificationToken.user_id == owner.id,
                        VerificationToken.consumed_at.is_(None),
                    )
                )
            ).scalars().all()
            assert {t.purpose for t in tokens} == {"email_verify", "email_verify_link"}
    finally:
        clear_test_email_outbox()


