import asyncio
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.models.booking import (
    Appointment,
    AppointmentStatusHistory,
    Booking,
    BookingStatusHistory,
    BusinessBookingConfig,
    EventSession,
    ResourceAllocation,
    TicketPass,
    TicketTier,
)
from app.models.engagement import Review
from scripts.backfill_phase2 import backfill_phase2_records, verify_phase2_parity
from tests.conftest import login_as


def _sign_webhook(payload_bytes: bytes) -> str:
    secret = get_settings().payment_webhook_secret
    sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


@pytest.mark.asyncio
async def test_phase2_non_cascade_fk_and_backfill_parity(session_factory: async_sessionmaker[AsyncSession]):
    # Verify ORM FK metadata never uses CASCADE on appointments.booking_id
    fk = next(iter(Appointment.__table__.c.booking_id.foreign_keys))
    assert (fk.ondelete or "").upper() != "CASCADE"
    assert (fk.ondelete or "").upper() == "SET NULL"

    async with session_factory() as session:
        # Insert a legacy-like appointment, status history, and review without booking_id
        legacy = Appointment(
            id="apt_legacy_only",
            business_id="biz_aura",
            service_id="svc_signature",
            employee_id="emp_vance",
            customer_id="usr_elena",
            start_at=datetime(2026, 12, 10, 18, 0, tzinfo=UTC),
            end_at=datetime(2026, 12, 10, 18, 45, tzinfo=UTC),
            status="confirmed",
            price=75,
            currency="USD",
            payment_status="unpaid",
            confirmation_mode="automatic",
            check_in_code="BK-LEGACY1",
        )
        legacy_history = AppointmentStatusHistory(
            id="ash_legacy_only",
            appointment_id="apt_legacy_only",
            from_status=None,
            to_status="confirmed",
            changed_by_user_id="usr_elena",
            reason="Legacy appointment before Phase 2",
        )
        legacy_review = Review(
            id="rev_legacy_only",
            business_id="biz_aura",
            author_id="usr_elena",
            appointment_id="apt_legacy_only",
            booking_id=None,
            rating=5,
            title="Legacy appointment review",
            body="Created prior to Phase 2 universal booking bridge.",
            status="published",
        )
        session.add_all([legacy, legacy_history, legacy_review])
        await session.commit()

        first_run = await backfill_phase2_records(session)
        assert first_run["created_configs"] >= 1
        assert first_run["created_bookings"] == 1
        assert first_run["created_histories"] >= 1
        assert first_run["linked_reviews"] >= 1

        parity = await verify_phase2_parity(session)
        assert parity["appointments_total"] >= 2
        assert parity["appointments_unlinked"] == 0
        assert parity["bookings_appointment_total"] == parity["appointments_total"]
        assert parity["count_parity"] is True
        assert parity["amount_parity"] is True
        assert parity["safe_non_cascade_fk"] is True

        refreshed = await session.get(Appointment, "apt_legacy_only")
        assert refreshed is not None
        assert refreshed.booking_id is not None

        refreshed_review = await session.get(Review, "rev_legacy_only")
        assert refreshed_review is not None
        assert refreshed_review.booking_id == refreshed.booking_id

        # Re-running backfill must be strictly idempotent (zero new rows or duplicates)
        cfg_count_before = int((await session.execute(select(func.count(BusinessBookingConfig.id)))).scalar_one())
        bk_count_before = int((await session.execute(select(func.count(Booking.id)))).scalar_one())
        hist_count_before = int((await session.execute(select(func.count(BookingStatusHistory.id)))).scalar_one())

        second_run = await backfill_phase2_records(session)
        assert second_run == {
            "created_configs": 0,
            "created_bookings": 0,
            "created_histories": 0,
            "linked_reviews": 0,
        }

        cfg_count_after = int((await session.execute(select(func.count(BusinessBookingConfig.id)))).scalar_one())
        bk_count_after = int((await session.execute(select(func.count(Booking.id)))).scalar_one())
        hist_count_after = int((await session.execute(select(func.count(BookingStatusHistory.id)))).scalar_one())
        assert cfg_count_after == cfg_count_before
        assert bk_count_after == bk_count_before
        assert hist_count_after == hist_count_before
        assert await verify_phase2_parity(session) == parity

        # Verify the universal Booking row exists in DB and matches the legacy appointment
        bk = await session.get(Booking, refreshed.booking_id)
        assert bk is not None
        assert bk.business_id == "biz_aura"
        assert bk.customer_id == "usr_elena"
        assert bk.booking_model == "appointment"
        assert float(bk.total_amount) == 75.0
        assert bk.check_in_code == "BK-LEGACY1"
        assert bk.metadata_json.get("legacyAppointmentId") == "apt_legacy_only"

        # Deleting the universal booking must NOT delete the legacy Appointment
        await session.delete(bk)
        await session.commit()

        session.expire_all()
        surviving = await session.get(Appointment, "apt_legacy_only")
        assert surviving is not None
        assert surviving.booking_id is None
        surviving_review = await session.get(Review, "rev_legacy_only")
        assert surviving_review is not None
        assert surviving_review.booking_id is None
        assert surviving_review.appointment_id == "apt_legacy_only"


@pytest.mark.asyncio
async def test_backfill_commit_false_preserves_transaction_and_links_existing_booking(
    session_factory: async_sessionmaker[AsyncSession],
):
    from scripts.backfill_phase2 import deterministic_booking_id

    async with session_factory() as session:
        legacy = Appointment(
            id="apt_legacy_commit_false",
            business_id="biz_aura",
            service_id="svc_signature",
            employee_id="emp_vance",
            customer_id="usr_elena",
            start_at=datetime(2026, 12, 11, 18, 0, tzinfo=UTC),
            end_at=datetime(2026, 12, 11, 18, 45, tzinfo=UTC),
            status="confirmed",
            price=75,
            currency="USD",
            payment_status="unpaid",
            confirmation_mode="automatic",
            check_in_code="BK-LEGACY2",
        )
        session.add(legacy)
        await session.commit()

        result = await backfill_phase2_records(session, commit=False)
        assert result["created_bookings"] == 1
        assert session.in_transaction()

        expected_bk_id = deterministic_booking_id("apt_legacy_commit_false")
        linked_bk = await session.get(Booking, expected_bk_id)
        linked_appt = await session.get(Appointment, "apt_legacy_commit_false")
        assert linked_bk is not None
        assert linked_appt is not None
        assert linked_appt.booking_id == linked_bk.id

        await session.commit()

    # Verify persisted after explicit commit and still links if appointment becomes unlinked while Booking exists
    async with session_factory() as verify_session:
        persisted_appt = await verify_session.get(Appointment, "apt_legacy_commit_false")
        assert persisted_appt is not None
        assert persisted_appt.booking_id is not None
        persisted_appt.booking_id = None
        await verify_session.commit()

        relink = await backfill_phase2_records(verify_session, commit=False)
        assert relink["created_bookings"] == 0
        await verify_session.commit()

        relinked_appt = await verify_session.get(Appointment, "apt_legacy_commit_false")
        assert relinked_appt is not None
        assert relinked_appt.booking_id == deterministic_booking_id("apt_legacy_commit_false")


@pytest.mark.asyncio
async def test_booking_configs_rbac_and_crud(client: AsyncClient):
    cust = await login_as(client, "customer@bookit.demo")
    owner = await login_as(client, "business@bookit.demo")
    cust_h = {"Authorization": f"Bearer {cust['accessToken']}"}
    owner_h = {"Authorization": f"Bearer {owner['accessToken']}"}

    # Customer cannot mutate business booking policies
    denied = await client.put(
        "/api/v1/businesses/biz_aura/booking-configs/resource",
        headers=cust_h,
        json={"enabled": True, "depositMode": "fixed", "depositValue": 30},
    )
    assert denied.status_code == 403

    # Owner enables resource booking with 50% deposit & 12h cutoff
    updated = await client.put(
        "/api/v1/businesses/biz_aura/booking-configs/resource",
        headers=owner_h,
        json={
            "enabled": True,
            "displayLabel": "Private Styling Suites",
            "approvalMode": "automatic",
            "cancellationCutoffHours": 12,
            "cancellationFeePercent": 50,
            "depositMode": "percent",
            "depositValue": 50,
        },
    )
    assert updated.status_code == 200, updated.text
    data = updated.json()
    assert data["bookingModel"] == "resource"
    assert data["depositMode"] == "percent"
    assert data["depositValue"] == 50.0

    listed = await client.get("/api/v1/businesses/biz_aura/booking-configs")
    assert listed.status_code == 200
    assert any(c["bookingModel"] == "resource" and c["enabled"] for c in listed.json())


@pytest.mark.asyncio
async def test_resource_concurrent_exclusive_and_block_prevention(client: AsyncClient):
    cust1 = await login_as(client, "customer@bookit.demo")
    cust2 = await login_as(client, "liam.patel@bookit.demo")
    admin = await login_as(client, "admin@bookit.demo")
    h1 = {"Authorization": f"Bearer {cust1['accessToken']}"}
    h2 = {"Authorization": f"Bearer {cust2['accessToken']}"}
    ha = {"Authorization": f"Bearer {admin['accessToken']}"}

    # Concurrent exclusive (unitsTotal=1) reservation on res_harbor_patio -> [201, 409]
    start_iso = "2026-12-15T19:00:00Z"
    end_iso = "2026-12-15T20:30:00Z"
    payload = {
        "bookingModel": "resource",
        "businessId": "biz_harbor",
        "resourceId": "res_harbor_patio",
        "startAt": start_iso,
        "endAt": end_iso,
        "quantityUnits": 1,
        "partySize": 2,
        "paymentMethod": "in_person",
    }
    r1, r2 = await asyncio.gather(
        client.post("/api/v1/bookings/universal", headers=h1, json=payload),
        client.post("/api/v1/bookings/universal", headers=h2, json=payload),
    )
    assert sorted([r1.status_code, r2.status_code]) == [201, 409]

    # Create a maintenance block on res_zenith_sauna via admin
    blk = await client.post(
        "/api/v1/businesses/biz_zenith/resources/res_zenith_sauna/blocks",
        headers=ha,
        json={
            "startAt": "2026-12-16T18:00:00Z",
            "endAt": "2026-12-16T19:00:00Z",
            "unitsBlocked": 1,
            "reason": "Deep sanitize",
        },
    )
    assert blk.status_code == 201, blk.text

    blocked_attempt = await client.post(
        "/api/v1/bookings/universal",
        headers=h1,
        json={
            "bookingModel": "resource",
            "businessId": "biz_zenith",
            "resourceId": "res_zenith_sauna",
            "startAt": "2026-12-16T18:00:00Z",
            "endAt": "2026-12-16T19:00:00Z",
            "quantityUnits": 1,
            "paymentMethod": "in_person",
        },
    )
    assert blocked_attempt.status_code == 409

    # Pooled dining booths (unitsTotal=4): 3 units + 2 units must reject the 2-unit request
    pool_ok = await client.post(
        "/api/v1/bookings/universal",
        headers=h1,
        json={
            "bookingModel": "resource",
            "businessId": "biz_harbor",
            "resourceId": "res_harbor_booth",
            "startAt": "2026-12-17T19:00:00Z",
            "endAt": "2026-12-17T20:30:00Z",
            "quantityUnits": 3,
            "partySize": 2,
            "paymentMethod": "in_person",
        },
    )
    assert pool_ok.status_code == 201

    pool_over = await client.post(
        "/api/v1/bookings/universal",
        headers=h2,
        json={
            "bookingModel": "resource",
            "businessId": "biz_harbor",
            "resourceId": "res_harbor_booth",
            "startAt": "2026-12-17T19:00:00Z",
            "endAt": "2026-12-17T20:30:00Z",
            "quantityUnits": 2,
            "partySize": 2,
            "paymentMethod": "in_person",
        },
    )
    assert pool_over.status_code == 409


@pytest.mark.asyncio
async def test_ticket_capacity_oversell_deposit_webhook_cancellation_and_qr(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]
):
    cust1 = await login_as(client, "customer@bookit.demo")
    cust2 = await login_as(client, "liam.patel@bookit.demo")
    owner = await login_as(client, "business@bookit.demo")
    h1 = {"Authorization": f"Bearer {cust1['accessToken']}"}
    h2 = {"Authorization": f"Bearer {cust2['accessToken']}"}
    ho = {"Authorization": f"Bearer {owner['accessToken']}"}

    # Tier capacity_limit on tier_aura_vip is 6, max_per_booking=4.
    # Two customers racing for 4 VIP tickets each -> [201, 409]
    vip_req = {
        "bookingModel": "ticket",
        "businessId": "biz_aura",
        "sessionId": "ses_aura_live_1",
        "tickets": [{"tierId": "tier_aura_vip", "quantity": 4}],
        "paymentMethod": "card_token_pending",
        "holdOnly": True,
    }
    t1, t2 = await asyncio.gather(
        client.post("/api/v1/bookings/universal", headers=h1, json=vip_req),
        client.post("/api/v1/bookings/universal", headers=h2, json=vip_req),
    )
    assert sorted([t1.status_code, t2.status_code]) == [201, 409]
    winner = t1 if t1.status_code == 201 else t2
    loser = t2 if t1.status_code == 201 else t1
    winner_headers = h1 if t1.status_code == 201 else h2
    assert "VIP Front Row" in loser.json()["detail"]
    bk = winner.json()
    assert bk["status"] == "held"
    assert len(bk["ticketPasses"]) == 4
    pass_code = bk["ticketPasses"][0]["passCode"]
    assert pass_code.startswith("TKT-")

    # Pay via deposit/full payment intent + signed webhook -> confirms booking!
    intent = await client.post(
        "/api/v1/payments/intents",
        headers=winner_headers,
        json={
            "referenceType": "booking",
            "referenceId": bk["id"],
            "method": "card_token_pending",
            "idempotencyKey": "idem_pay_bk_1",
        },
    )
    assert intent.status_code == 201, intent.text
    pay_id = intent.json()["payment"]["id"]

    wh_bytes = json.dumps({
        "eventId": "evt_bk_paid_1",
        "eventType": "payment.succeeded",
        "paymentId": pay_id,
    }).encode("utf-8")
    wh = await client.post(
        "/api/v1/payments/webhooks/sandbox",
        content=wh_bytes,
        headers={"Content-Type": "application/json", "X-BookIt-Signature": _sign_webhook(wh_bytes)},
    )
    assert wh.status_code == 200

    loaded = await client.get(f"/api/v1/bookings/universal/{bk['id']}", headers=winner_headers)
    assert loaded.status_code == 200
    assert loaded.json()["status"] == "confirmed"
    assert loaded.json()["paymentStatus"] == "paid"

    # QR Check-in using individual TKT-... pass code
    checkin = await client.post(
        "/api/v1/bookings/universal/businesses/biz_aura/check-in",
        headers=ho,
        json={"checkInCode": pass_code},
    )
    assert checkin.status_code == 200, checkin.text
    assert checkin.json()["kind"] == "ticket_pass"
    assert checkin.json()["status"] == "checked_in"
    assert checkin.json()["ticketPassId"] is not None

    # Duplicate scan rejected cleanly as already checked in (409)
    dup_scan = await client.post(
        "/api/v1/bookings/universal/businesses/biz_aura/check-in",
        headers=ho,
        json={"checkInCode": pass_code},
    )
    assert dup_scan.status_code == 409

    # Cancel a fresh booking and verify capacity released in DB
    fresh = await client.post(
        "/api/v1/bookings/universal",
        headers=h1,
        json={
            "bookingModel": "ticket",
            "businessId": "biz_aura",
            "sessionId": "ses_aura_live_1",
            "tickets": [{"tierId": "tier_aura_ga", "quantity": 2}],
            "paymentMethod": "in_person",
        },
    )
    assert fresh.status_code == 201
    fresh_id = fresh.json()["id"]

    cancelled = await client.patch(
        f"/api/v1/bookings/universal/{fresh_id}/status",
        headers=h1,
        json={"status": "cancelled", "reason": "Schedule changed"},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"

    async with session_factory() as s:
        tier_ga = await s.get(TicketTier, "tier_aura_ga")
        assert tier_ga is not None
        assert tier_ga.reserved_count == 0
        ses = await s.get(EventSession, "ses_aura_live_1")
        assert ses is not None
        assert ses.reserved_count == 4


@pytest.mark.asyncio
async def test_ticket_insufficient_tier_capacity_returns_409_and_rolls_back(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]
):
    cust1 = await login_as(client, "customer@bookit.demo")
    cust2 = await login_as(client, "liam.patel@bookit.demo")
    h1 = {"Authorization": f"Bearer {cust1['accessToken']}"}
    h2 = {"Authorization": f"Bearer {cust2['accessToken']}"}

    # Reserve 4 of 6 VIP tickets (session still has 16 of 20 spots remaining)
    first = await client.post(
        "/api/v1/bookings/universal",
        headers=h1,
        json={
            "bookingModel": "ticket",
            "businessId": "biz_aura",
            "sessionId": "ses_aura_live_1",
            "tickets": [{"tierId": "tier_aura_vip", "quantity": 4}],
            "paymentMethod": "in_person",
        },
    )
    assert first.status_code == 201, first.text

    # Request 3 more VIP tickets: session check passes (4+3 <= 20), tier check fails (4+3 > 6)
    # and must roll back session reserved_count and return 409 with tier name (never 500/MissingGreenlet)
    over = await client.post(
        "/api/v1/bookings/universal",
        headers=h2,
        json={
            "bookingModel": "ticket",
            "businessId": "biz_aura",
            "sessionId": "ses_aura_live_1",
            "tickets": [{"tierId": "tier_aura_vip", "quantity": 3}],
            "paymentMethod": "in_person",
        },
    )
    assert over.status_code == 409, over.text
    assert over.json()["detail"] == "Tier 'VIP Front Row' does not have enough tickets remaining"

    async with session_factory() as s:
        ses = await s.get(EventSession, "ses_aura_live_1")
        tier_vip = await s.get(TicketTier, "tier_aura_vip")
        assert ses is not None and ses.reserved_count == 4
        assert tier_vip is not None and tier_vip.reserved_count == 4


@pytest.mark.asyncio
async def test_legacy_appointment_dual_write_and_qr_compatibility(client: AsyncClient):
    cust = await login_as(client, "customer@bookit.demo")
    headers = {"Authorization": f"Bearer {cust['accessToken']}"}

    appt = await client.post(
        "/api/v1/bookings",
        headers=headers,
        json={
            "serviceId": "svc_signature",
            "employeeId": "emp_vance",
            "date": "2026-12-18",
            "time": "14:00",
            "paymentMethod": "in_person",
        },
    )
    assert appt.status_code == 201, appt.text
    appt_data = appt.json()
    assert appt_data["bookingId"] is not None

    bk = await client.get(f"/api/v1/bookings/universal/{appt_data['bookingId']}", headers=headers)
    assert bk.status_code == 200
    assert bk.json()["bookingModel"] == "appointment"
    assert bk.json()["legacyAppointmentId"] == appt_data["id"]

    # QR check-in via universal endpoint using BK-... code also updates legacy appointment
    checkin = await client.post(
        "/api/v1/bookings/universal/businesses/biz_aura/check-in",
        headers=headers,
        json={"checkInCode": appt_data["checkInCode"]},
    )
    assert checkin.status_code == 200
    assert checkin.json()["kind"] == "appointment"
    assert checkin.json()["legacyAppointmentId"] == appt_data["id"]

    refreshed_appt = await client.get(f"/api/v1/bookings/{appt_data['id']}", headers=headers)
    assert refreshed_appt.status_code == 200
    assert refreshed_appt.json()["checkedInAt"] is not None
