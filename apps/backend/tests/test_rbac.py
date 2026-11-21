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


@pytest.mark.asyncio
async def test_bootstrap_inactive_inventory_rbac_and_cross_business_isolation(
    client: AsyncClient, session_factory
):
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.models.booking import EventOffering, Resource
    from app.models.business import Membership

    factory: async_sessionmaker[AsyncSession] = session_factory
    async with factory() as session:
        session.add_all([
            Resource(
                id="res_aura_active",
                business_id="biz_aura",
                name="Active Styling Chair",
                resource_type="custom",
                active=True,
            ),
            Resource(
                id="res_aura_inactive",
                business_id="biz_aura",
                name="Archived Styling Suite",
                resource_type="custom",
                active=False,
            ),
            Resource(
                id="res_opal_inactive",
                business_id="biz_opal",
                name="Archived Dental Operatory",
                resource_type="custom",
                active=False,
            ),
            Resource(
                id="res_apex_inactive",
                business_id="biz_apex",
                name="Archived Squat Rack",
                resource_type="equipment",
                active=False,
            ),
            Resource(
                id="res_crown_inactive",
                business_id="biz_crown",
                name="Archived Barber Chair",
                resource_type="custom",
                active=False,
            ),
            EventOffering(
                id="evt_aura_inactive",
                business_id="biz_aura",
                booking_model="ticket",
                category="workshop",
                title="Archived Hair Showcase",
                active=False,
            ),
            EventOffering(
                id="evt_opal_inactive",
                business_id="biz_opal",
                booking_model="capacity",
                category="class",
                title="Archived Hygiene Q&A",
                active=False,
            ),
            EventOffering(
                id="evt_apex_inactive",
                business_id="biz_apex",
                booking_model="capacity",
                category="class",
                title="Archived Mobility Clinic",
                active=False,
            ),
            EventOffering(
                id="evt_crown_inactive",
                business_id="biz_crown",
                booking_model="ticket",
                category="workshop",
                title="Archived Shave Workshop",
                active=False,
            ),
            # Give biz_apex owner (usr_liam) an employee role in biz_aura to prove cross-business isolation
            Membership(
                id="mem_liam_aura_emp",
                user_id="usr_liam",
                business_id="biz_aura",
                role="employee",
                status="active",
                title="Guest Coach",
            ),
        ])
        await session.commit()

    def _ids(payload: dict) -> tuple[set[str], set[str]]:
        return (
            {r["id"] for r in payload["resources"]},
            {o["id"] for o in payload["eventOfferings"]},
        )

    all_inactive_res = {"res_aura_inactive", "res_opal_inactive", "res_apex_inactive", "res_crown_inactive"}
    all_inactive_evt = {"evt_aura_inactive", "evt_opal_inactive", "evt_apex_inactive", "evt_crown_inactive"}

    # 1. Public (unauthenticated) users only receive active inventory
    pub_resp = await client.get("/api/v1/bootstrap")
    assert pub_resp.status_code == 200
    pub_res, pub_evt = _ids(pub_resp.json())
    assert "res_aura_active" in pub_res
    assert "evt_aura_masterclass" in pub_evt
    assert pub_res.isdisjoint(all_inactive_res)
    assert pub_evt.isdisjoint(all_inactive_evt)

    # 2. Employee / Receptionist (usr_elena_vance: employee at biz_aura, receptionist at biz_crown)
    #    must only receive active inventory
    emp = await login_as(client, "employee@bookit.demo")
    emp_resp = await client.get("/api/v1/bootstrap", headers={"Authorization": f"Bearer {emp['accessToken']}"})
    assert emp_resp.status_code == 200
    emp_res, emp_evt = _ids(emp_resp.json())
    assert "res_aura_active" in emp_res
    assert "evt_aura_masterclass" in emp_evt
    assert emp_res.isdisjoint(all_inactive_res)
    assert emp_evt.isdisjoint(all_inactive_evt)

    # 3. Owner (biz_aura) & Manager (biz_opal) receive inactive inventory ONLY for their authorized businesses
    owner = await login_as(client, "business@bookit.demo")
    owner_resp = await client.get("/api/v1/bootstrap", headers={"Authorization": f"Bearer {owner['accessToken']}"})
    assert owner_resp.status_code == 200
    owner_res, owner_evt = _ids(owner_resp.json())
    assert {"res_aura_active", "res_aura_inactive", "res_opal_inactive"}.issubset(owner_res)
    assert {"evt_aura_masterclass", "evt_aura_inactive", "evt_opal_inactive"}.issubset(owner_evt)
    assert {"res_apex_inactive", "res_crown_inactive"}.isdisjoint(owner_res)
    assert {"evt_apex_inactive", "evt_crown_inactive"}.isdisjoint(owner_evt)

    # 4. Business-specific permission: owner of biz_apex + employee of biz_aura sees inactive in biz_apex ONLY
    liam = await login_as(client, "liam.patel@bookit.demo")
    liam_resp = await client.get("/api/v1/bootstrap", headers={"Authorization": f"Bearer {liam['accessToken']}"})
    assert liam_resp.status_code == 200
    liam_res, liam_evt = _ids(liam_resp.json())
    assert "res_apex_inactive" in liam_res
    assert "evt_apex_inactive" in liam_evt
    assert "res_aura_inactive" not in liam_res
    assert "evt_aura_inactive" not in liam_evt

    # 5. Platform admin sees all inactive inventory
    admin = await login_as(client, "admin@bookit.demo")
    admin_resp = await client.get("/api/v1/bootstrap", headers={"Authorization": f"Bearer {admin['accessToken']}"})
    assert admin_resp.status_code == 200
    admin_res, admin_evt = _ids(admin_resp.json())
    assert all_inactive_res.issubset(admin_res)
    assert all_inactive_evt.issubset(admin_evt)

@pytest.mark.asyncio
async def test_employee_cannot_view_inactive_inventory(client: AsyncClient):
    owner = await login_as(client, "business@bookit.demo")
    owner_headers = {"Authorization": f"Bearer {owner['accessToken']}"}

    employee = await login_as(client, "employee@bookit.demo")
    employee_headers = {"Authorization": f"Bearer {employee['accessToken']}"}

    created = await client.post(
        "/api/v1/businesses/biz_aura/offerings",
        headers=owner_headers,
        json={
            "bookingModel": "ticket",
            "category": "Test",
            "title": "Inactive Test Event",
            "active": False,
        },
    )
    assert created.status_code == 201, created.text
    offering_id = created.json()["id"]

    # Employee must not see inactive offering
    response = await client.get(
        "/api/v1/businesses/biz_aura/offerings?includeInactive=true",
        headers=employee_headers,
    )
    assert response.status_code == 200
    assert offering_id not in [item["id"] for item in response.json()]

    # Owner must see inactive offering
    response = await client.get(
        "/api/v1/businesses/biz_aura/offerings?includeInactive=true",
        headers=owner_headers,
    )
    assert offering_id in [item["id"] for item in response.json()]
