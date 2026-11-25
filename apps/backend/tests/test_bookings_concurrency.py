import asyncio
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.booking import Appointment
from tests.conftest import login_as


@pytest.mark.asyncio
async def test_concurrent_double_booking_prevented(client: AsyncClient):
    cust1 = await login_as(client, "customer@bookit.demo")
    cust2 = await login_as(client, "liam.patel@bookit.demo")

    h1 = {"Authorization": f"Bearer {cust1['accessToken']}"}
    h2 = {"Authorization": f"Bearer {cust2['accessToken']}"}

    payload = {
        "serviceId": "svc_signature",
        "employeeId": "emp_vance",
        "date": "2026-12-01",
        "time": "14:00",
        "paymentMethod": "in_person",
    }

    r1, r2 = await asyncio.gather(
        client.post("/api/v1/bookings", headers=h1, json=payload),
        client.post("/api/v1/bookings", headers=h2, json=payload),
    )

    statuses = sorted([r1.status_code, r2.status_code])
    assert statuses == [201, 409], f"Expected [201, 409], got {[r1.status_code, r2.status_code]}: {r1.text} | {r2.text}"


@pytest.mark.asyncio
async def test_db_gist_exclusion_constraint_blocks_direct_overlap(session_factory: async_sessionmaker[AsyncSession]):
    async with session_factory() as session:
        session.add(
            Appointment(
                id="apt_direct_1",
                business_id="biz_aura",
                service_id="svc_signature",
                employee_id="emp_vance",
                customer_id="usr_elena",
                start_at=datetime(2026, 11, 25, 18, 0, tzinfo=UTC),
                end_at=datetime(2026, 11, 25, 18, 45, tzinfo=UTC),
                status="confirmed",
                price=75,
                currency="USD",
                payment_status="unpaid",
                confirmation_mode="automatic",
            )
        )
        await session.commit()

    # Second overlapping confirmed appointment for same employee must raise IntegrityError at PostgreSQL level
    async with session_factory() as session2:
        session2.add(
            Appointment(
                id="apt_direct_2",
                business_id="biz_aura",
                service_id="svc_signature",
                employee_id="emp_vance",
                customer_id="usr_liam",
                start_at=datetime(2026, 11, 25, 18, 15, tzinfo=UTC),
                end_at=datetime(2026, 11, 25, 19, 0, tzinfo=UTC),
                status="confirmed",
                price=75,
                currency="USD",
                payment_status="unpaid",
                confirmation_mode="automatic",
            )
        )
        with pytest.raises(IntegrityError):
            await session2.commit()


@pytest.mark.asyncio
async def test_booking_idempotency_history_reschedule_and_qr_checkin(client: AsyncClient):
    cust = await login_as(client, "customer@bookit.demo")
    owner = await login_as(client, "business@bookit.demo")
    cust_headers = {"Authorization": f"Bearer {cust['accessToken']}"}
    owner_headers = {"Authorization": f"Bearer {owner['accessToken']}"}

    # Idempotent booking creation returns same appointment
    body = {
        "serviceId": "svc_signature",
        "employeeId": "emp_vance",
        "date": "2026-12-01",
        "time": "10:00",
        "paymentMethod": "in_person",
        "idempotencyKey": "idem_booking_xyz_1",
    }
    a1 = await client.post("/api/v1/bookings", headers=cust_headers, json=body)
    a2 = await client.post("/api/v1/bookings", headers=cust_headers, json=body)
    assert a1.status_code == 201
    assert a2.status_code == 201
    assert a1.json()["id"] == a2.json()["id"]
    appt_id = a1.json()["id"]
    qr_code = a1.json()["checkInCode"]
    assert qr_code

    # QR front-desk check-in
    checkin = await client.post(
        "/api/v1/bookings/businesses/biz_aura/check-in",
        headers=cust_headers,
        json={"checkInCode": qr_code},
    )
    assert checkin.status_code == 200
    assert checkin.json()["checkedInAt"] is not None

    # Reschedule to 11:00
    resched = await client.post(
        f"/api/v1/bookings/{appt_id}/reschedule",
        headers=cust_headers,
        json={"date": "2026-12-01", "time": "11:00"},
    )
    assert resched.status_code == 200

    # Owner marks completed, then customer cannot cancel completed appointment
    comp = await client.patch(
        f"/api/v1/bookings/{appt_id}/status",
        headers=owner_headers,
        json={"status": "completed", "reason": "Finished service"},
    )
    assert comp.status_code == 200

    cancel_after_done = await client.patch(
        f"/api/v1/bookings/{appt_id}/status",
        headers=cust_headers,
        json={"status": "cancelled"},
    )
    assert cancel_after_done.status_code == 409

    history = await client.get(f"/api/v1/bookings/{appt_id}/history", headers=cust_headers)
    assert history.status_code == 200
    assert len(history.json()) == 3
