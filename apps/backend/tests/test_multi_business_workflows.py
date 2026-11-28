import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.business import Membership
from tests.conftest import login_as


def _new_biz_payload(name: str, category: str) -> dict:
    return {
        "businessName": name,
        "legalName": f"{name} LLC",
        "category": category,
        "country": "United States",
        "city": "Seattle",
        "address": "400 Pine St",
        "phone": "+1 206 555 0160",
        "email": f"{name.lower().replace(' ', '.')}@example.com",
        "website": "",
        "description": f"Multi-business test venue for {category} bookings on the same account.",
        "ownerName": "Elena Rostova",
        "ownerEmail": "customer@bookit.demo",
        "ownerPhone": "+1 206 555 0142",
        "ownerPassword": "",
        "ownerConfirmPassword": "",
    }


@pytest.mark.asyncio
async def test_single_customer_creates_manages_and_isolates_multiple_businesses(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
):
    # Sign in once as existing customer account (usr_elena)
    cust = await login_as(client, "customer@bookit.demo")
    hc = {"Authorization": f"Bearer {cust['accessToken']}"}

    admin = await login_as(client, "admin@bookit.demo")
    ha = {"Authorization": f"Bearer {admin['accessToken']}"}

    # Register Business #1 (hotel) and Business #2 (travel / transportation) using the SAME account
    app_hotel = await client.post(
        "/api/v1/businesses/applications",
        headers=hc,
        json=_new_biz_payload("Cascade Harbor Hotel", "hotel"),
    )
    assert app_hotel.status_code == 201, app_hotel.text
    biz_hotel_id = app_hotel.json()["businessId"]

    app_travel = await client.post(
        "/api/v1/businesses/applications",
        headers=hc,
        json=_new_biz_payload("Sound Shuttle & Tours", "travel"),
    )
    assert app_travel.status_code == 201, app_travel.text
    biz_travel_id = app_travel.json()["businessId"]

    assert biz_hotel_id != biz_travel_id
    assert app_hotel.json()["applicantUserId"] == "usr_elena"
    assert app_travel.json()["applicantUserId"] == "usr_elena"

    # Admin approves both businesses
    for app_id in (app_hotel.json()["id"], app_travel.json()["id"]):
        rev = await client.post(
            f"/api/v1/admin/applications/{app_id}/review",
            headers=ha,
            json={"action": "approve", "note": "Verified multi-business owner"},
        )
        assert rev.status_code == 200, rev.text

    # Re-fetch /auth/me and /bootstrap: usr_elena now owns BOTH active workspaces
    me = await client.get("/api/v1/auth/me", headers=hc)
    assert me.status_code == 200
    owned_ids = {w["businessId"] for w in me.json()["workspaces"] if w["role"] == "owner" and w["status"] == "active"}
    assert {biz_hotel_id, biz_travel_id}.issubset(owned_ids)

    boot = await client.get("/api/v1/bootstrap", headers=hc)
    assert boot.status_code == 200
    boot_mems = {m["businessId"]: m for m in boot.json()["memberships"] if m["userId"] == "usr_elena"}
    assert biz_hotel_id in boot_mems and biz_travel_id in boot_mems

    # Create distinct inventory in each business (hotel room vs shuttle vehicle)
    room = await client.post(
        f"/api/v1/businesses/{biz_hotel_id}/resources",
        headers=hc,
        json={
            "name": "Soundview King Suite",
            "resourceType": "hotel_room",
            "description": "Waterfront king suite.",
            "capacityPeople": 2,
            "unitsTotal": 2,
            "pricingUnit": "per_night",
            "slotDurationMinutes": 1440,
            "minDurationMinutes": 720,
            "basePrice": 240,
        },
    )
    assert room.status_code == 201, room.text

    shuttle = await client.post(
        f"/api/v1/businesses/{biz_travel_id}/resources",
        headers=hc,
        json={
            "name": "Airport Executive Sprinter",
            "resourceType": "vehicle",
            "description": "Private airport transfer van.",
            "capacityPeople": 6,
            "unitsTotal": 1,
            "pricingUnit": "per_slot",
            "slotDurationMinutes": 60,
            "minDurationMinutes": 60,
            "basePrice": 120,
        },
    )
    assert shuttle.status_code == 201, shuttle.text

    # Verify inventory stays cleanly isolated by business
    hotel_resources = await client.get(f"/api/v1/businesses/{biz_hotel_id}/resources", headers=hc)
    travel_resources = await client.get(f"/api/v1/businesses/{biz_travel_id}/resources", headers=hc)
    assert [r["id"] for r in hotel_resources.json()] == [room.json()["id"]]
    assert [r["id"] for r in travel_resources.json()] == [shuttle.json()["id"]]

    # Verify suspended membership on one workspace preserves access to the other
    async with session_factory() as db:
        mem_hotel = (
            await db.execute(
                select(Membership).where(
                    Membership.user_id == "usr_elena",
                    Membership.business_id == biz_hotel_id,
                )
            )
        ).scalar_one()
        mem_hotel.status = "suspended"
        await db.commit()

    blocked_hotel_ws = await client.get(f"/api/v1/workspaces/{biz_hotel_id}/overview", headers=hc)
    assert blocked_hotel_ws.status_code == 403

    allowed_travel_ws = await client.get(f"/api/v1/workspaces/{biz_travel_id}/overview", headers=hc)
    assert allowed_travel_ws.status_code == 200
