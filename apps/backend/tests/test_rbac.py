import pytest
from httpx import AsyncClient

from tests.conftest import login_as


@pytest.mark.asyncio
async def test_rbac_and_idor_boundaries(client: AsyncClient):
    customer = await login_as(client, "customer@bookit.demo")
    customer_headers = {"Authorization": f"Bearer {customer['accessToken']}"}

    owner = await login_as(client, "business@bookit.demo")
    owner_headers = {"Authorization": f"Bearer {owner['accessToken']}"}

    employee = await login_as(client, "employee@bookit.demo")
    employee_headers = {"Authorization": f"Bearer {employee['accessToken']}"}

    other_owner = await login_as(client, "liam.patel@bookit.demo")
    other_owner_headers = {"Authorization": f"Bearer {other_owner['accessToken']}"}

    admin = await login_as(client, "admin@bookit.demo")
    admin_headers = {"Authorization": f"Bearer {admin['accessToken']}"}

    # 1. Unauthenticated request blocked
    unauth = await client.get("/api/v1/bookings")
    assert unauth.status_code == 401

    # 2. Customer cannot access business workspace settings or admin endpoints
    cust_biz = await client.patch(
        "/api/v1/businesses/biz_aura",
        headers=customer_headers,
        json={"name": "Hacked Salon"},
    )
    assert cust_biz.status_code == 403

    cust_admin = await client.get("/api/v1/admin/overview", headers=customer_headers)
    assert cust_admin.status_code == 403

    # 3. Employee (view-only bookings/services) cannot create services or change business profile
    emp_svc = await client.post(
        "/api/v1/workspaces/biz_aura/services",
        headers=employee_headers,
        json={
            "name": "Unauthorized Service",
            "description": "Should be rejected for employee role",
            "category": "Hair",
            "price": 50,
            "durationMinutes": 30,
            "cancellationPolicy": "24h notice",
        },
    )
    assert emp_svc.status_code == 403

    # 4. Cross-tenant IDOR: Owner of Apex Fitness (biz_apex) cannot modify Aura Hair (biz_aura)
    cross_tenant = await client.patch(
        "/api/v1/businesses/biz_aura",
        headers=other_owner_headers,
        json={"name": "Cross Tenant Takeover"},
    )
    assert cross_tenant.status_code == 403

    # 5. Customer cannot view another customer's appointment
    # Create appointment as customer first, then inspect as other_owner (unrelated to biz_aura)
    created = await client.post(
        "/api/v1/bookings",
        headers=customer_headers,
        json={
            "serviceId": "svc_signature",
            "employeeId": "emp_vance",
            "date": "2026-11-23",
            "time": "10:00",
            "paymentMethod": "in_person",
        },
    )
    assert created.status_code == 201, created.text
    appt_id = created.json()["id"]

    idor_view = await client.get(f"/api/v1/bookings/{appt_id}", headers=other_owner_headers)
    assert idor_view.status_code == 403

    # 6. Owner of biz_aura CAN create service and manage bookings
    owner_svc = await client.post(
        "/api/v1/workspaces/biz_aura/services",
        headers=owner_headers,
        json={
            "name": "Gloss Refresh",
            "description": "Quick botanical gloss treatment",
            "category": "Color",
            "price": 65,
            "durationMinutes": 30,
            "cancellationPolicy": "24 hours notice",
        },
    )
    assert owner_svc.status_code == 201

    # 7. Admin CAN review pending application
    review = await client.post(
        "/api/v1/admin/applications/app_luxe/review",
        headers=admin_headers,
        json={"action": "approve", "note": "Verified business license"},
    )
    assert review.status_code == 200
    assert review.json()["status"] == "approved"
