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
            "date": "2026-12-01",
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


@pytest.mark.asyncio
async def test_bootstrap_inactive_services_products_session_details_invite_accept_and_wallet_guard(
    client: AsyncClient,
    session_factory,
):
    from datetime import UTC, datetime, timedelta

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.models.booking import EventOffering, EventSession
    from app.models.catalog import Product, Service

    factory: async_sessionmaker[AsyncSession] = session_factory
    start_dt = datetime.now(UTC) + timedelta(days=7)
    end_dt = start_dt + timedelta(hours=2)

    async with factory() as session:
        session.add_all([
            Service(
                id="svc_aura_inactive",
                business_id="biz_aura",
                name="Archived Hair Gloss",
                description="Inactive service",
                category="Hair",
                price=80,
                duration_minutes=45,
                cancellation_policy="24h notice",
                active=False,
            ),
            Product(
                id="prd_aura_inactive",
                business_id="biz_aura",
                category_id="cat_beauty",
                name="Archived Hair Oil",
                description="Inactive product",
                price=34,
                image_url="https://example.com/oil.jpg",
                stock=5,
                active=False,
            ),
            EventOffering(
                id="evt_aura_hidden_ses",
                business_id="biz_aura",
                booking_model="ticket",
                category="workshop",
                title="Hidden Event Session",
                active=False,
            ),
            EventSession(
                id="ses_aura_hidden_details",
                offering_id="evt_aura_hidden_ses",
                business_id="biz_aura",
                start_at=start_dt,
                end_at=end_dt,
                timezone="America/Los_Angeles",
                total_capacity=20,
                reserved_count=0,
                max_per_booking=4,
                status="on_sale",
            ),
        ])
        await session.commit()

    owner = await login_as(client, "business@bookit.demo")
    owner_h = {"Authorization": f"Bearer {owner['accessToken']}"}
    employee = await login_as(client, "employee@bookit.demo")
    emp_h = {"Authorization": f"Bearer {employee['accessToken']}"}
    cust = await login_as(client, "customer@bookit.demo")
    cust_h = {"Authorization": f"Bearer {cust['accessToken']}"}
    liam = await login_as(client, "liam.patel@bookit.demo")
    liam_h = {"Authorization": f"Bearer {liam['accessToken']}"}

    # Public and employee users do not receive inactive services/products in bootstrap
    for hdrs in ({}, emp_h, cust_h):
        boot = await client.get("/api/v1/bootstrap", headers=hdrs)
        assert boot.status_code == 200
        data = boot.json()
        assert "svc_aura_inactive" not in {s["id"] for s in data["services"]}
        assert "prd_aura_inactive" not in {p["id"] for p in data["products"]}

    # Owner of biz_aura DOES receive inactive service/product for biz_aura
    owner_boot = await client.get("/api/v1/bootstrap", headers=owner_h)
    assert owner_boot.status_code == 200
    owner_data = owner_boot.json()
    assert "svc_aura_inactive" in {s["id"] for s in owner_data["services"]}
    assert "prd_aura_inactive" in {p["id"] for p in owner_data["products"]}

    # get_session_details hides sessions belonging to inactive offerings from public & employees
    assert (
        await client.get("/api/v1/businesses/biz_aura/sessions/ses_aura_hidden_details")
    ).status_code == 404
    assert (
        await client.get("/api/v1/businesses/biz_aura/sessions/ses_aura_hidden_details", headers=emp_h)
    ).status_code == 404
    assert (
        await client.get("/api/v1/businesses/biz_aura/sessions/ses_aura_hidden_details", headers=owner_h)
    ).status_code == 200

    # Staff invite acceptance flow
    invite = await client.post(
        "/api/v1/workspaces/biz_aura/team/invite",
        headers=owner_h,
        json={"email": "liam.patel@bookit.demo", "role": "manager", "title": "Guest Manager"},
    )
    assert invite.status_code == 201, invite.text
    assert invite.json()["status"] == "invited"

    accepted = await client.post("/api/v1/workspaces/biz_aura/team/accept", headers=liam_h)
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "active"

    # Wallet payment method on universal booking does not bypass payment settlement
    wallet_bk = await client.post(
        "/api/v1/bookings/universal",
        headers=cust_h,
        json={
            "bookingModel": "ticket",
            "businessId": "biz_aura",
            "sessionId": "ses_aura_live_1",
            "tickets": [{"tierId": "tier_aura_ga", "quantity": 1}],
            "paymentMethod": "wallet",
        },
    )
    assert wallet_bk.status_code == 201, wallet_bk.text
    assert wallet_bk.json()["paymentStatus"] == "unpaid"
    assert wallet_bk.json()["amountPaid"] == 0.0
