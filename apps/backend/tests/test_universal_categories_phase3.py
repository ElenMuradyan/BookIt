import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from tests.conftest import login_as


@pytest.mark.asyncio
async def test_all_five_booking_categories_including_transportation_vehicle_and_capacity(client: AsyncClient):
    cust1 = await login_as(client, "customer@bookit.demo")
    cust2 = await login_as(client, "liam.patel@bookit.demo")
    noah = await login_as(client, "noah.grant@bookit.demo")  # owner of biz_passage (travel)
    owner_aura = await login_as(client, "business@bookit.demo")

    h1 = {"Authorization": f"Bearer {cust1['accessToken']}"}
    h2 = {"Authorization": f"Bearer {cust2['accessToken']}"}
    hn = {"Authorization": f"Bearer {noah['accessToken']}"}
    ha = {"Authorization": f"Bearer {owner_aura['accessToken']}"}

    # Ensure future non-holiday date
    d = datetime.now(UTC).date() + timedelta(days=15)
    if d.isoformat() == "2026-11-26":
        d += timedelta(days=1)
    # Shift away from Sat/Sun so CLINIC_HOURS on biz_passage is always open
    while d.weekday() >= 5:
        d += timedelta(days=1)
    date_str = d.isoformat()

    # 1. SERVICES (Appointment)
    svc_bk = await client.post(
        "/api/v1/bookings/universal",
        headers=h1,
        json={
            "bookingModel": "appointment",
            "serviceId": "svc_signature",
            "employeeId": "emp_vance",
            "date": date_str,
            "time": "10:00",
            "paymentMethod": "in_person",
        },
    )
    assert svc_bk.status_code == 201, svc_bk.text
    assert svc_bk.json()["bookingModel"] == "appointment"

    # 2. RESTAURANTS (Table slot search + reservation)
    table_search = await client.get(
        f"/api/v1/businesses/biz_harbor/resources/search?date={date_str}&time=19:00&guests=4"
    )
    assert table_search.status_code == 200
    assert len(table_search.json()) >= 1
    first_table = table_search.json()[0]
    slot_19 = next(s for s in first_table["slots"] if s["time"] == "19:00")
    dine_bk = await client.post(
        "/api/v1/bookings/universal",
        headers=h1,
        json={
            "bookingModel": "resource",
            "businessId": "biz_harbor",
            "resourceId": first_table["resource"]["id"],
            "startAt": slot_19["startAt"],
            "endAt": slot_19["endAt"],
            "quantityUnits": 1,
            "partySize": 4,
            "paymentMethod": "in_person",
        },
    )
    assert dine_bk.status_code == 201, dine_bk.text
    assert dine_bk.json()["bookingModel"] == "resource"

    # 3. HOTELS (Stays availability + per-night booking)
    stays = await client.get(
        f"/api/v1/businesses/biz_northline/stays/availability?checkIn={date_str}&checkOut={(d + timedelta(days=2)).isoformat()}&guests=2"
    )
    assert stays.status_code == 200, stays.text
    assert len(stays.json()["options"]) >= 1
    room_opt = stays.json()["options"][0]
    stay_bk = await client.post(
        "/api/v1/bookings/universal",
        headers=h1,
        json={
            "bookingModel": "resource",
            "businessId": "biz_northline",
            "resourceId": room_opt["resource"]["id"],
            "startAt": room_opt["checkInAt"],
            "endAt": room_opt["checkOutAt"],
            "quantityUnits": 1,
            "partySize": 2,
            "paymentMethod": "in_person",
        },
    )
    assert stay_bk.status_code == 201, stay_bk.text
    assert stay_bk.json()["totalAmount"] == room_opt["totalPrice"]

    # 4. EVENTS / TICKETS (Ticket pass issuance + QR check-in)
    evt_bk = await client.post(
        "/api/v1/bookings/universal",
        headers=h1,
        json={
            "bookingModel": "ticket",
            "businessId": "biz_aura",
            "sessionId": "ses_aura_live_1",
            "tickets": [{"tierId": "tier_aura_ga", "quantity": 1, "attendeeNames": ["Elena Rostova"]}],
            "paymentMethod": "in_person",
        },
    )
    assert evt_bk.status_code == 201, evt_bk.text
    pass_code = evt_bk.json()["ticketPasses"][0]["passCode"]
    qr = await client.post(
        "/api/v1/bookings/universal/businesses/biz_aura/check-in",
        headers=ha,
        json={"checkInCode": pass_code},
    )
    assert qr.status_code == 200
    assert qr.json()["status"] == "checked_in"

    # 5. TRANSPORTATION (Private charter vehicle resource + scheduled shuttle capacity session on biz_passage)
    vehicle = await client.post(
        "/api/v1/businesses/biz_passage/resources",
        headers=hn,
        json={
            "name": "Executive Mercedes Sprinter",
            "resourceType": "vehicle",
            "description": "Private 6-passenger airport & city transfer.",
            "capacityPeople": 6,
            "unitsTotal": 1,
            "pricingUnit": "per_slot",
            "slotDurationMinutes": 60,
            "minDurationMinutes": 60,
            "basePrice": 140,
            "attributes": {"driverIncluded": True, "luggageCapacity": 6},
        },
    )
    assert vehicle.status_code == 201, vehicle.text
    vehicle_id = vehicle.json()["id"]

    veh_avail = await client.get(
        f"/api/v1/businesses/biz_passage/resources/{vehicle_id}/availability?date={date_str}"
    )
    assert veh_avail.status_code == 200, veh_avail.text
    veh_slots = veh_avail.json()["slots"]
    assert len(veh_slots) >= 1
    chosen_slot = veh_slots[0]

    # Concurrent private vehicle booking -> exactly 1 succeeds and 1 conflicts (409)
    veh_payload = {
        "bookingModel": "resource",
        "businessId": "biz_passage",
        "resourceId": vehicle_id,
        "startAt": chosen_slot["startAt"],
        "endAt": chosen_slot["endAt"],
        "quantityUnits": 1,
        "partySize": 4,
        "paymentMethod": "in_person",
    }
    v1, v2 = await asyncio.gather(
        client.post("/api/v1/bookings/universal", headers=h1, json=veh_payload),
        client.post("/api/v1/bookings/universal", headers=h2, json=veh_payload),
    )
    assert sorted([v1.status_code, v2.status_code]) == [201, 409]

    # Scheduled shuttle route using capacity model
    shuttle_off = await client.post(
        "/api/v1/businesses/biz_passage/offerings",
        headers=hn,
        json={
            "bookingModel": "capacity",
            "category": "transfer",
            "title": "SEA-TAC Express Shuttle",
            "description": "Hourly shared express transfer.",
            "venueArea": "Bay 4",
            "cancellationPolicy": "Free cancellation up to 2 hours before departure.",
        },
    )
    assert shuttle_off.status_code == 201, shuttle_off.text

    dep_start = datetime.combine(d, datetime.min.time(), tzinfo=UTC) + timedelta(hours=16)
    shuttle_ses = await client.post(
        f"/api/v1/businesses/biz_passage/offerings/{shuttle_off.json()['id']}/sessions",
        headers=hn,
        json={
            "startAt": dep_start.isoformat(),
            "endAt": (dep_start + timedelta(minutes=45)).isoformat(),
            "timezone": "America/Los_Angeles",
            "totalCapacity": 5,
            "maxPerBooking": 4,
            "status": "on_sale",
            "tiers": [{"name": "Standard Seat", "price": 28, "capacityLimit": 5}],
        },
    )
    assert shuttle_ses.status_code == 201, shuttle_ses.text
    ses_id = shuttle_ses.json()["id"]

    shuttle_bk_ok = await client.post(
        "/api/v1/bookings/universal",
        headers=h1,
        json={
            "bookingModel": "capacity",
            "businessId": "biz_passage",
            "sessionId": ses_id,
            "quantity": 3,
            "attendeeNames": ["Elena", "Guest 1", "Guest 2"],
            "paymentMethod": "in_person",
        },
    )
    assert shuttle_bk_ok.status_code == 201, shuttle_bk_ok.text
    assert shuttle_bk_ok.json()["quantity"] == 3

    shuttle_bk_over = await client.post(
        "/api/v1/bookings/universal",
        headers=h2,
        json={
            "bookingModel": "capacity",
            "businessId": "biz_passage",
            "sessionId": ses_id,
            "quantity": 3,
            "paymentMethod": "in_person",
        },
    )
    assert shuttle_bk_over.status_code == 409
