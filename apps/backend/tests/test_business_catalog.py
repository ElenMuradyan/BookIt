import pytest
from httpx import AsyncClient

from tests.conftest import login_as


@pytest.mark.asyncio
async def test_public_discovery_bootstrap_redaction_and_availability(client: AsyncClient):
    # Unauthenticated discovery hides unapproved businesses (biz_luxe)
    pub = await client.get("/api/v1/businesses")
    assert pub.status_code == 200
    biz_ids = {b["id"] for b in pub.json()}
    assert "biz_aura" in biz_ids
    assert "biz_luxe" not in biz_ids

    hidden = await client.get("/api/v1/businesses/biz_luxe")
    assert hidden.status_code == 404

    # Availability endpoint checks holiday (2026-11-26) vs normal day (2026-11-23)
    holiday = await client.get(
        "/api/v1/businesses/biz_aura/availability",
        params={"serviceId": "svc_signature", "date": "2026-11-26"},
    )
    assert holiday.status_code == 200
    assert holiday.json()["slots"] == []

    normal = await client.get(
        "/api/v1/businesses/biz_aura/availability",
        params={"serviceId": "svc_signature", "date": "2026-11-23"},
    )
    assert normal.status_code == 200
    assert "09:00" in normal.json()["slots"]

    # Unauthenticated bootstrap has zero private appointments/orders/addresses and redacts user emails
    boot_anon = await client.get("/api/v1/bootstrap")
    assert boot_anon.status_code == 200
    bjson = boot_anon.json()
    assert bjson["appointments"] == []
    assert bjson["orders"] == []
    assert bjson["addresses"] == []
    assert all(u["email"] == "redacted@bookit.app" for u in bjson["users"])

    # Authenticated customer bootstrap includes own bookings & own email, redacts other users
    cust = await login_as(client, "customer@bookit.demo")
    boot_cust = await client.get(
        "/api/v1/bootstrap",
        headers={"Authorization": f"Bearer {cust['accessToken']}"},
    )
    assert boot_cust.status_code == 200
    cjson = boot_cust.json()
    assert len(cjson["appointments"]) >= 1
    me_user = next(u for u in cjson["users"] if u["id"] == "usr_elena")
    assert me_user["email"] == "customer@bookit.demo"
    other_user = next(u for u in cjson["users"] if u["id"] == "usr_elena_vance")
    assert other_user["email"] == "redacted@bookit.app"
