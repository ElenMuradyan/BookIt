"""Idempotent development database seeder mirroring BookIt frontend seed entities.
Only intended for local development and demo environments (never run blindly on production).
"""
import asyncio
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session_factory
from app.core.security import hash_password
from app.models.booking import (
    Appointment,
    AppointmentStatusHistory,
    Booking,
    BookingStatusHistory,
    BusinessBookingConfig,
    CustomerNote,
    EventOffering,
    EventSession,
    Resource,
    TicketTier,
)
from app.models.business import Business, BusinessApplication, Membership
from app.models.catalog import Employee, EmployeeService, Product, ProductCategory, ProductVariant, Service
from app.models.commerce import (
    Cart,
    CartItem,
    Expense,
    Plan,
    Subscription,
)
from app.models.engagement import Advertisement, Favorite, Notification, PromoCode, Report, Review
from app.models.user import Address, CustomerProfile, User


def dt(iso_str: str) -> datetime:
    parsed = datetime.fromisoformat(iso_str)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def day_cfg(open_t: str, close_t: str) -> dict:
    return {"closed": False, "open": open_t, "close": close_t}


def closed_cfg() -> dict:
    return {"closed": True, "open": "00:00", "close": "00:00"}


def weekly_hours(weekday: dict, saturday: dict | None = None, sunday: dict | None = None) -> dict:
    sat = saturday or closed_cfg()
    sun = sunday or closed_cfg()
    return {"mon": weekday, "tue": weekday, "wed": weekday, "thu": weekday, "fri": weekday, "sat": sat, "sun": sun}


SALON_HOURS = weekly_hours(day_cfg("09:00", "19:00"), day_cfg("10:00", "18:00"))
CLINIC_HOURS = weekly_hours(day_cfg("08:00", "17:00"), day_cfg("09:00", "13:00"))
GYM_HOURS = weekly_hours(day_cfg("06:00", "21:00"), day_cfg("08:00", "18:00"), day_cfg("08:00", "14:00"))
TABLE_HOURS = weekly_hours(day_cfg("11:00", "22:00"), day_cfg("10:00", "23:00"), day_cfg("10:00", "21:00"))
HOTEL_HOURS = weekly_hours(day_cfg("00:00", "23:59"), day_cfg("00:00", "23:59"), day_cfg("00:00", "23:59"))
SHOP_HOURS = weekly_hours(day_cfg("10:00", "19:00"), day_cfg("11:00", "17:00"))


async def seed_database(session: AsyncSession) -> None:
    existing_user = await session.get(User, "usr_elena")
    if existing_user:
        print("BookIt database already seeded.")
        return

    demo_hash = hash_password("Demo1234!")
    users_data = [
        ("usr_elena", "Elena", "Rostova", "elena", "customer@bookit.demo", "+1 206 555 0142", False, ["Hair", "Wellness", "Design"], "1996-04-18"),
        ("usr_jordan", "Jordan", "Hale", "jordan", "business@bookit.demo", "+1 206 555 0177", False, ["Studios", "Hospitality"], None),
        ("usr_elena_vance", "Elena", "Vance", "elenavance", "employee@bookit.demo", "+1 206 555 0194", False, ["Color", "Styling"], None),
        ("usr_alex", "Alexander", "Vance", "alexander", "admin@bookit.demo", "+1 206 555 0101", True, ["Platform operations"], None),
        ("usr_marcus", "Marcus", "Chen", "marcus", "marcus.chen@bookit.demo", "+1 206 555 0100", False, [], None),
        ("usr_priya", "Priya", "Sharma", "priya", "priya.sharma@bookit.demo", "+1 206 555 0100", False, [], None),
        ("usr_sora", "Sora", "Tanaka", "sora", "sora.tanaka@bookit.demo", "+1 206 555 0100", False, [], None),
        ("usr_sarah", "Sarah", "Jenkins", "sarah", "sarah.jenkins@bookit.demo", "+1 206 555 0100", False, [], None),
        ("usr_liam", "Liam", "Patel", "liam", "liam.patel@bookit.demo", "+1 206 555 0100", False, [], None),
        ("usr_david", "David", "Miller", "david", "david.miller@bookit.demo", "+1 206 555 0100", False, [], None),
        ("usr_aria", "Aria", "Chen", "aria", "aria.chen@bookit.demo", "+1 206 555 0100", False, [], None),
        ("usr_chloe", "Chloe", "Kim", "chloe", "chloe.kim@bookit.demo", "+1 206 555 0100", False, [], None),
        ("usr_sophia", "Sophia", "Bennett", "sophia", "sophia.bennett@bookit.demo", "+1 206 555 0100", False, [], None),
        ("usr_noah", "Noah", "Grant", "noah", "noah.grant@bookit.demo", "+1 206 555 0100", False, [], None),
    ]

    for uid, fn, ln, un, em, ph, is_admin, interests, dob in users_data:
        session.add(
            User(
                id=uid,
                first_name=fn,
                last_name=ln,
                username=un,
                email=em,
                phone=ph,
                password_hash=demo_hash,
                date_of_birth=dob,
                location="Seattle, WA",
                language="English",
                interests=interests,
                email_verified=True,
                phone_verified=True,
                status="active",
                is_platform_admin=is_admin,
            )
        )
        session.add(
            CustomerProfile(
                user_id=uid,
                interests=interests,
                language="English",
                marketing_opt_in=(uid == "usr_elena"),
                personalization_consent=(uid == "usr_elena"),
                consent_updated_at=dt("2025-06-12T15:00:00+00:00") if uid == "usr_elena" else None,
                spending_visibility="recorded_only",
                theme="dark",
            )
        )

    session.add_all([
        Address(
            id="addr_elena_home",
            user_id="usr_elena",
            label="Home",
            line1="418 Bellevue Ave E",
            city="Seattle",
            region="WA",
            postal_code="98102",
            country="United States",
            is_default=True,
        ),
        Address(
            id="addr_elena_work",
            user_id="usr_elena",
            label="Studio",
            line1="1200 Western Ave",
            city="Seattle",
            region="WA",
            postal_code="98101",
            country="United States",
            is_default=False,
        ),
    ])

    await session.flush()

    def make_loc(lid: str, addr: str, city: str, lat: float, lng: float) -> dict:
        return {
            "id": lid,
            "label": "Primary",
            "line1": addr,
            "city": city,
            "region": "WA",
            "postalCode": "98101",
            "country": "United States",
            "geo": {"lat": lat, "lng": lng},
        }

    businesses_data = [
        ("biz_aura", "usr_jordan", "Aura Hair & Aesthetics", "Aura Hair LLC", "beauty", "Boutique salon for color, cuts, and facial treatments in the Downtown Arts District.", "Seattle", "428 Mercer Street, Suite 2B", make_loc("loc_aura", "428 Mercer Street, Suite 2B", "Seattle", 47.625, -122.347), "+1 206 555 2210", "hello@aurahair.demo", SALON_HOURS, 4.9, 348, 3, "approved", True, 1.2, ["Color", "Cuts", "Facials"], [{"id": "blk_aura_1", "date": "2026-11-26", "start": "13:00", "end": "14:00", "reason": "Team training"}]),
        ("biz_lumina", "usr_sophia", "Lumina Hair & Glow Studio", "Lumina Glow Inc", "beauty", "Light-filled studio for gloss, balayage, and scalp treatments.", "Seattle", "88 Pine Street", make_loc("loc_lumina", "88 Pine Street", "Seattle", 47.609, -122.34), "+1 206 555 2288", "book@lumina.demo", SALON_HOURS, 4.9, 328, 3, "approved", True, 0.8, ["Balayage", "Gloss"], []),
        ("biz_zenith", "usr_aria", "Zenith Wellness Spa", "Zenith Wellness Co", "wellness", "Massage, recovery, and quiet treatment rooms near the waterfront.", "Seattle", "19 Alaskan Way", make_loc("loc_zenith", "19 Alaskan Way", "Seattle", 47.606, -122.342), "+1 206 555 2400", "care@zenith.demo", weekly_hours(day_cfg("09:00", "20:00"), day_cfg("09:00", "18:00"), day_cfg("10:00", "16:00")), 4.8, 215, 3, "approved", True, 1.2, ["Massage", "Recovery"], []),
        ("biz_crown", "usr_marcus", "Crown & Blade Barber Co.", "Crown and Blade LLC", "barber", "Classic barbering, beard work, and hot towel shaves.", "Seattle", "510 Pike Place", make_loc("loc_crown", "510 Pike Place", "Seattle", 47.61, -122.342), "+1 206 555 2190", "desk@crownblade.demo", SALON_HOURS, 4.9, 412, 2, "approved", True, 0.5, ["Fade", "Beard", "Shave"], []),
        ("biz_opal", "usr_sarah", "Opal Dental Care", "Opal Dental PC", "healthcare", "Neighborhood dentistry for cleanings, aligner consults, and preventive care.", "Seattle", "900 Madison Street", make_loc("loc_opal", "900 Madison Street", "Seattle", 47.609, -122.324), "+1 206 555 2601", "appointments@opal.demo", CLINIC_HOURS, 4.8, 186, 3, "approved", True, 2.4, ["Cleaning", "Preventive"], []),
        ("biz_apex", "usr_liam", "Apex Fitness", "Apex Fitness LLC", "fitness", "Strength, conditioning, and small-group coaching.", "Seattle", "77 Yale Ave N", make_loc("loc_apex", "77 Yale Ave N", "Seattle", 47.625, -122.33), "+1 206 555 2702", "train@apex.demo", GYM_HOURS, 4.7, 264, 2, "approved", True, 1.8, ["Strength", "Coaching"], []),
        ("biz_harbor", "usr_chloe", "Harbor & Rye", "Harbor and Rye LLC", "restaurant", "Seasonal plates and a short wine list in a cedar dining room.", "Seattle", "1400 Western Ave", make_loc("loc_harbor", "1400 Western Ave", "Seattle", 47.608, -122.346), "+1 206 555 2803", "tables@harborandrye.demo", TABLE_HOURS, 4.6, 502, 3, "approved", True, 0.9, ["Dinner", "Seasonal"], []),
        ("biz_northline", "usr_david", "Northline Hotel", "Northline Hospitality Inc", "hotel", "A 42-room hotel with day passes for the courtyard and meeting suites.", "Seattle", "2000 1st Avenue", make_loc("loc_north", "2000 1st Avenue", "Seattle", 47.611, -122.345), "+1 206 555 2904", "stay@northline.demo", HOTEL_HOURS, 4.5, 640, 3, "approved", True, 1.1, ["Stay", "Day pass"], []),
        ("biz_volt", "usr_noah", "Volt Auto Atelier", "Volt Atelier LLC", "auto", "Detailing, ceramic coating, and scheduled maintenance bays.", "Seattle", "3300 Airport Way S", make_loc("loc_volt", "3300 Airport Way S", "Seattle", 47.575, -122.322), "+1 206 555 3005", "bay@volt.demo", weekly_hours(day_cfg("08:00", "18:00"), day_cfg("09:00", "14:00")), 4.7, 151, 2, "approved", True, 3.4, ["Detailing", "Coating"], []),
        ("biz_komorebi", "usr_aria", "Komorebi Clay & Ceramics", "Komorebi Studio LLC", "retail", "Workshop bookings and stoneware sold by the artists who throw it.", "Seattle", "610 E Pine Street", make_loc("loc_komo", "610 E Pine Street", "Seattle", 47.615, -122.323), "+1 206 555 3106", "studio@komorebi.demo", SHOP_HOURS, 5.0, 96, 2, "approved", True, 1.6, ["Workshop", "Tableware"], []),
        ("biz_circuit", "usr_david", "Circuit & Co", "Circuit and Co LLC", "retail", "Small-batch audio, chargers, and desk gadgets from an independent seller.", "Seattle", "92 S Jackson Street", make_loc("loc_circuit", "92 S Jackson Street", "Seattle", 47.599, -122.334), "+1 206 555 3308", "orders@circuit.demo", SHOP_HOURS, 4.5, 89, 2, "approved", True, 1.4, ["Audio", "Gadgets"], []),
        ("biz_hearth", "usr_chloe", "Hearth Home", "Hearth Home Goods LLC", "retail", "Furniture and linen from regional makers.", "Seattle", "555 Yale Ave N", make_loc("loc_hearth", "555 Yale Ave N", "Seattle", 47.623, -122.33), "+1 206 555 3409", "hello@hearth.demo", SHOP_HOURS, 4.7, 74, 3, "approved", True, 1.9, ["Furniture", "Linen"], []),
        ("biz_trailhead", "usr_liam", "Trailhead Supply", "Trailhead Supply Co", "retail", "Independent shop for running shoes, training gear, and fit appointments.", "Seattle", "2200 Eastlake Ave E", make_loc("loc_trail", "2200 Eastlake Ave E", "Seattle", 47.64, -122.325), "+1 206 555 3207", "fit@trailhead.demo", SHOP_HOURS, 4.6, 128, 2, "approved", True, 2.2, ["Footwear", "Training"], []),
        ("biz_passage", "usr_noah", "Passage Travel Desk", "Passage Travel LLC", "travel", "Itinerary consults for weekend trips, rail routes, and small group travel.", "Seattle", "800 Pike Street", make_loc("loc_passage", "800 Pike Street", "Seattle", 47.612, -122.331), "+1 206 555 3510", "plan@passage.demo", CLINIC_HOURS, 4.8, 63, 2, "approved", True, 0.7, ["Itineraries", "Rail"], []),
        ("biz_luxe", "usr_sophia", "Luxe Studio Lounge", "Luxe Studio Lounge LLC", "beauty", "Application in review. This studio is not bookable until BookIt approves it.", "Seattle", "77 Spring Street", make_loc("loc_luxe", "77 Spring Street", "Seattle", 47.605, -122.335), "+1 206 555 3611", "apply@luxestudio.demo", SALON_HOURS, 0.0, 0, 3, "under_review", False, 1.0, ["Pending"], []),
    ]

    for bid, oid, name, legal, cat, desc, city, addr, loc, ph, em, hrs, rat, rc, pl, st, pub, dist, tags, blk in businesses_data:
        session.add(
            Business(
                id=bid,
                owner_user_id=oid,
                name=name,
                legal_name=legal,
                category=cat,
                description=desc,
                country="United States",
                city=city,
                address=addr,
                timezone="America/Los_Angeles",
                location=loc,
                phone=ph,
                email=em,
                hours=hrs,
                holidays=[{"date": "2026-11-26", "name": "Thanksgiving"}],
                blocked=blk,
                rating=rat,
                review_count=rc,
                price_level=pl,
                status=st,
                is_public=pub,
                distance_miles=dist,
                tags=tags,
                cancellation_policy="Free cancellation up to 24 hours before the appointment.",
                booking_approval="manual" if bid == "biz_opal" else "automatic",
            )
        )

    await session.flush()

    memberships = [
        ("mem_jordan_aura", "usr_jordan", "biz_aura", "owner", "Founder"),
        ("mem_jordan_opal", "usr_jordan", "biz_opal", "manager", "Operations manager"),
        ("mem_vance_aura", "usr_elena_vance", "biz_aura", "employee", "Senior stylist"),
        ("mem_vance_crown", "usr_elena_vance", "biz_crown", "receptionist", "Front desk"),
        ("mem_marcus_aura", "usr_marcus", "biz_aura", "employee", "Color director"),
        ("mem_marcus_crown", "usr_marcus", "biz_crown", "owner", "Owner barber"),
        ("mem_priya_aura", "usr_priya", "biz_aura", "employee", "Esthetician"),
        ("mem_sora_aura", "usr_sora", "biz_aura", "employee", "Esthetician"),
        ("mem_sarah_opal", "usr_sarah", "biz_opal", "owner", "Dentist"),
        ("mem_noah_opal", "usr_noah", "biz_opal", "employee", "Dentist"),
        ("mem_david_aura_acc", "usr_david", "biz_aura", "accountant", "Bookkeeper"),
        ("mem_liam_apex", "usr_liam", "biz_apex", "owner", "Coach"),
        ("mem_chloe_harbor", "usr_chloe", "biz_harbor", "owner", "Restaurateur"),
        ("mem_aria_zenith", "usr_aria", "biz_zenith", "owner", "Spa Director"),
        ("mem_aria_komorebi", "usr_aria", "biz_komorebi", "owner", "Ceramicist"),
        ("mem_david_northline", "usr_david", "biz_northline", "owner", "Hotelier"),
        ("mem_noah_volt", "usr_noah", "biz_volt", "owner", "Lead Technician"),
        ("mem_noah_passage", "usr_noah", "biz_passage", "owner", "Travel Director"),
        ("mem_sophia_luxe", "usr_sophia", "biz_luxe", "owner", "Applicant"),
    ]
    for mid, uid, bid, role, title in memberships:
        session.add(Membership(id=mid, user_id=uid, business_id=bid, role=role, status="active", title=title))

    await session.flush()

    employees = [
        ("emp_vance", "biz_aura", "usr_elena_vance", "mem_vance_aura", "Senior Stylist & Colorist", SALON_HOURS, "available", 4.9),
        ("emp_marcus", "biz_aura", "usr_marcus", "mem_marcus_aura", "Color Director", SALON_HOURS, "available", 4.9),
        ("emp_priya", "biz_aura", "usr_priya", "mem_priya_aura", "Medical Esthetician", SALON_HOURS, "off_shift", 4.8),
        ("emp_sora", "biz_aura", "usr_sora", "mem_sora_aura", "Esthetician", SALON_HOURS, "available", 4.7),
        ("emp_marcus_crown", "biz_crown", "usr_marcus", "mem_marcus_crown", "Owner barber", SALON_HOURS, "available", 4.9),
        ("emp_noah", "biz_opal", "usr_noah", "mem_noah_opal", "Dentist", CLINIC_HOURS, "available", 4.8),
        ("emp_sarah", "biz_opal", "usr_sarah", "mem_sarah_opal", "Dentist", CLINIC_HOURS, "available", 4.9),
        ("emp_liam", "biz_apex", "usr_liam", "mem_liam_apex", "Coach", GYM_HOURS, "available", 4.7),
    ]
    for eid, bid, uid, mid, title, hrs, st, rat in employees:
        session.add(Employee(id=eid, business_id=bid, user_id=uid, membership_id=mid, title=title, bio=title, hours=hrs, status=st, rating=rat))

    services = [
        ("svc_signature", "biz_aura", "Signature Haircut & Style", "Cut, wash, and blow-dry.", "Hair", 75, 45, False),
        ("svc_balayage", "biz_aura", "Full Balayage & Gloss", "Consultation included.", "Color", 190, 150, False),
        ("svc_facial", "biz_aura", "Hydra-Facial Express", "Deep cleanse and peel.", "Skincare", 85, 30, False),
        ("svc_beard", "biz_crown", "Executive Beard Trim", "Shape, hot towel, and finish.", "Beard", 35, 30, False),
        ("svc_fade", "biz_crown", "Classic Fade", "Scissor and clipper cut.", "Cut", 42, 40, False),
        ("svc_cleaning", "biz_opal", "Preventive Cleaning", "Exam and cleaning with a dentist.", "Dental", 95, 50, True),
        ("svc_coach", "biz_apex", "Strength Intro", "One-to-one coaching session.", "Training", 70, 50, False),
    ]
    for sid, bid, name, desc, cat, price, dur, req_app in services:
        session.add(
            Service(
                id=sid,
                business_id=bid,
                name=name,
                description=desc,
                category=cat,
                price=price,
                currency="USD",
                duration_minutes=dur,
                active=True,
                requires_approval=req_app,
            )
        )
    await session.flush()

    emp_svc_links = [
        ("emp_vance", "svc_signature"),
        ("emp_marcus", "svc_signature"),
        ("emp_marcus", "svc_balayage"),
        ("emp_priya", "svc_facial"),
        ("emp_sora", "svc_facial"),
        ("emp_marcus_crown", "svc_beard"),
        ("emp_marcus_crown", "svc_fade"),
        ("emp_noah", "svc_cleaning"),
        ("emp_sarah", "svc_cleaning"),
        ("emp_liam", "svc_coach"),
    ]
    for eid, sid in emp_svc_links:
        session.add(EmployeeService(employee_id=eid, service_id=sid))

    session.add_all([
        ProductCategory(id="cat_electronics", name="Electronics", slug="electronics"),
        ProductCategory(id="cat_clothing", name="Clothing", slug="clothing"),
        ProductCategory(id="cat_accessories", name="Accessories", slug="accessories"),
        ProductCategory(id="cat_home", name="Home", slug="home"),
        ProductCategory(id="cat_sports", name="Sports", slug="sports"),
        ProductCategory(id="cat_beauty", name="Beauty", slug="beauty"),
        ProductCategory(id="cat_gifts", name="Gifts", slug="gifts"),
    ])
    await session.flush()

    session.add_all([
        Product(
            id="prd_headphones",
            business_id="biz_circuit",
            category_id="cat_electronics",
            name="Studio Headphones",
            description="Closed-back headphones for desks and travel.",
            price=189,
            compare_at_price=210,
            image_url="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
            stock=24,
            featured=True,
            popular=True,
            rating=4.6,
            review_count=36,
        ),
        Product(
            id="prd_charger",
            business_id="biz_circuit",
            category_id="cat_electronics",
            name="GaN Travel Charger",
            description="65W charger with two USB-C ports.",
            price=48,
            image_url="https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=900&q=80",
            stock=80,
            popular=True,
            rating=4.6,
            review_count=92,
        ),
        Product(
            id="prd_throw",
            business_id="biz_hearth",
            category_id="cat_home",
            name="Linen Throw",
            description="Stonewashed linen, 50 by 70 inches.",
            price=68,
            compare_at_price=82,
            image_url="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=80",
            stock=20,
            popular=True,
            rating=4.6,
            review_count=32,
        ),
        Product(
            id="prd_serum",
            business_id="biz_aura",
            category_id="cat_beauty",
            name="Hydra-Glow Serum",
            description="The serum used after Aura facials.",
            price=36,
            image_url="https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=900&q=80",
            stock=42,
            featured=True,
            popular=True,
            rating=4.8,
            review_count=54,
        ),
    ])
    await session.flush()
    session.add_all([
        ProductVariant(id="var_hp_black", product_id="prd_headphones", sku="HP-BLK", label="Black", stock=14, color="Black"),
        ProductVariant(id="var_hp_sand", product_id="prd_headphones", sku="HP-SND", label="Sand", stock=10, color="Sand"),
    ])

    session.add_all([
        Plan(id="starter", name="Starter", monthly_price=29, description="For a single location finding its rhythm.", features=["Calendar", "Bookings", "1 location"]),
        Plan(id="professional", name="Professional", monthly_price=79, description="For teams that sell services and products.", features=["Team permissions", "Products", "Campaigns"]),
        Plan(id="enterprise", name="Enterprise", monthly_price=199, description="For multi-location operators.", features=["Multiple locations", "Priority review", "Advanced roles"]),
    ])
    await session.flush()

    session.add(
        Subscription(
            id="sub_aura",
            business_id="biz_aura",
            plan_id="professional",
            status="trialing",
            trial_ends_at=dt("2026-12-19T00:00:00+00:00"),
            renews_at=dt("2026-12-19T00:00:00+00:00"),
            started_at=dt("2026-11-19T00:00:00+00:00"),
        )
    )
    session.add(
        BusinessApplication(
            id="app_luxe",
            business_id="biz_luxe",
            applicant_user_id="usr_sophia",
            status="under_review",
            submitted_at=dt("2026-11-12T16:20:00+00:00"),
            documents=[{"id": "doc_luxe_1", "name": "Business license.pdf", "kind": "license", "state": "placeholder"}],
        )
    )

    cart = Cart(id="cart_elena", user_id="usr_elena")
    session.add(cart)
    await session.flush()
    session.add_all([
        CartItem(id="ci_1", cart_id="cart_elena", product_id="prd_throw", quantity=1, seller_id="biz_hearth"),
        CartItem(id="ci_2", cart_id="cart_elena", product_id="prd_charger", quantity=2, seller_id="biz_circuit"),
    ])

    session.add(
        Booking(
            id="bk_seed_apt_elena_upcoming",
            business_id="biz_aura",
            customer_id="usr_elena",
            booking_model="appointment",
            title_snapshot="Signature Haircut & Style",
            start_at=dt("2026-11-20T18:30:00+00:00"),
            end_at=dt("2026-11-20T19:15:00+00:00"),
            timezone="America/Los_Angeles",
            quantity=1,
            status="confirmed",
            confirmation_mode="automatic",
            subtotal_amount=75,
            discount_amount=0,
            tax_amount=0,
            total_amount=75,
            deposit_due_amount=0,
            amount_paid=75,
            refunded_amount=0,
            currency="USD",
            payment_status="paid",
            payment_method="card_token_pending",
            cancellation_cutoff_at=dt("2026-11-19T18:30:00+00:00"),
            cancellation_policy_snapshot="Free cancellation up to 24 hours before the visit.",
            metadata_json={
                "legacyAppointmentId": "apt_elena_upcoming",
                "serviceId": "svc_signature",
                "employeeId": "emp_vance",
            },
            check_in_code="BK-ELENA1",
        )
    )
    await session.flush()
    session.add(
        BookingStatusHistory(
            id="bsh_seed_1",
            booking_id="bk_seed_apt_elena_upcoming",
            from_status=None,
            to_status="confirmed",
            changed_by_user_id="usr_elena",
            reason="Seed appointment",
        )
    )
    session.add(
        Appointment(
            id="apt_elena_upcoming",
            booking_id="bk_seed_apt_elena_upcoming",
            business_id="biz_aura",
            service_id="svc_signature",
            employee_id="emp_vance",
            customer_id="usr_elena",
            start_at=dt("2026-11-20T18:30:00+00:00"),
            end_at=dt("2026-11-20T19:15:00+00:00"),
            status="confirmed",
            price=75,
            currency="USD",
            payment_status="paid",
            payment_method="card_token_pending",
            confirmation_mode="automatic",
            check_in_code="BK-ELENA1",
        )
    )
    session.add(
        AppointmentStatusHistory(
            id="ash_seed_1",
            appointment_id="apt_elena_upcoming",
            from_status=None,
            to_status="confirmed",
            changed_by_user_id="usr_elena",
            reason="Seed appointment",
        )
    )

    session.add_all([
        BusinessBookingConfig(
            id="bcfg_aura_appt",
            business_id="biz_aura",
            booking_model="appointment",
            enabled=True,
            display_label="Salon Appointments",
            approval_mode="automatic",
            min_notice_minutes=30,
            max_advance_days=90,
            cancellation_cutoff_hours=24,
            cancellation_fee_percent=0,
            cancellation_policy_text="Free cancellation up to 24 hours before the visit.",
            deposit_mode="none",
            deposit_value=0,
        ),
        BusinessBookingConfig(
            id="bcfg_aura_ticket",
            business_id="biz_aura",
            booking_model="ticket",
            enabled=True,
            display_label="Masterclasses & Events",
            approval_mode="automatic",
            min_notice_minutes=60,
            max_advance_days=180,
            cancellation_cutoff_hours=48,
            cancellation_fee_percent=25,
            cancellation_policy_text="75% refund up to 48 hours before event start.",
            deposit_mode="none",
            deposit_value=0,
        ),
        BusinessBookingConfig(
            id="bcfg_harbor_res",
            business_id="biz_harbor",
            booking_model="resource",
            enabled=True,
            display_label="Tables & Dining Spaces",
            approval_mode="automatic",
            min_notice_minutes=30,
            max_advance_days=60,
            buffer_after_minutes=15,
            cancellation_cutoff_hours=6,
            cancellation_fee_percent=0,
            cancellation_policy_text="Free table cancellation up to 6 hours ahead.",
            deposit_mode="fixed",
            deposit_value=25,
            settings={"slotIntervalMinutes": 30},
        ),
        BusinessBookingConfig(
            id="bcfg_zenith_res",
            business_id="biz_zenith",
            booking_model="resource",
            enabled=True,
            display_label="Recovery Suites",
            approval_mode="automatic",
            min_notice_minutes=30,
            max_advance_days=90,
            cancellation_cutoff_hours=24,
            deposit_mode="percent",
            deposit_value=25,
        ),
        BusinessBookingConfig(
            id="bcfg_north_res",
            business_id="biz_northline",
            booking_model="resource",
            enabled=True,
            display_label="Stays & Courtyard Suites",
            approval_mode="automatic",
            min_notice_minutes=60,
            max_advance_days=365,
            cancellation_cutoff_hours=48,
            cancellation_policy_text="Free cancellation up to 48 hours before check-in.",
            deposit_mode="percent",
            deposit_value=20,
            hold_ttl_minutes=15,
            settings={"checkInTime": "15:00", "checkOutTime": "11:00"},
        ),
        BusinessBookingConfig(
            id="bcfg_volt_res",
            business_id="biz_volt",
            booking_model="resource",
            enabled=True,
            display_label="Service Bays & Courtesy Vehicles",
            approval_mode="automatic",
            min_notice_minutes=60,
            max_advance_days=90,
            cancellation_cutoff_hours=12,
            deposit_mode="none",
            deposit_value=0,
            settings={"slotIntervalMinutes": 60},
        ),
        BusinessBookingConfig(
            id="bcfg_passage_res",
            business_id="biz_passage",
            booking_model="resource",
            enabled=True,
            display_label="Transfers & Vehicles",
            approval_mode="automatic",
            min_notice_minutes=60,
            max_advance_days=180,
            cancellation_cutoff_hours=24,
            deposit_mode="none",
            deposit_value=0,
            settings={"slotIntervalMinutes": 60},
        ),
        BusinessBookingConfig(
            id="bcfg_komorebi_cap",
            business_id="biz_komorebi",
            booking_model="capacity",
            enabled=True,
            display_label="Ceramics Workshops",
            approval_mode="automatic",
            min_notice_minutes=60,
            max_advance_days=90,
            cancellation_cutoff_hours=24,
            deposit_mode="none",
            deposit_value=0,
        ),
    ])

    session.add_all([
        Resource(
            id="res_harbor_patio",
            business_id="biz_harbor",
            name="Cedar Patio Table",
            resource_type="restaurant_table",
            description="Heated cedar table for up to 4 guests.",
            capacity_people=4,
            units_total=1,
            pricing_unit="per_slot",
            slot_duration_minutes=90,
            min_duration_minutes=90,
            max_duration_minutes=120,
            buffer_minutes=15,
            base_price=25,
            currency="USD",
            deposit_amount=25,
            attributes={"seating": "outdoor", "heated": True},
        ),
        Resource(
            id="res_harbor_booth",
            business_id="biz_harbor",
            name="Main Dining Booth",
            resource_type="restaurant_table",
            description="Standard two-person dining booths in the cedar room.",
            capacity_people=2,
            units_total=4,
            pricing_unit="per_slot",
            slot_duration_minutes=90,
            min_duration_minutes=90,
            max_duration_minutes=120,
            buffer_minutes=15,
            base_price=0,
            currency="USD",
            attributes={"seating": "indoor"},
        ),
        Resource(
            id="res_zenith_sauna",
            business_id="biz_zenith",
            name="Private Cedar Sauna Suite",
            resource_type="meeting_room",
            description="60-minute private contrast suite with cold plunge.",
            capacity_people=2,
            units_total=1,
            pricing_unit="per_hour",
            slot_duration_minutes=60,
            min_duration_minutes=60,
            max_duration_minutes=120,
            buffer_minutes=15,
            base_price=95,
            currency="USD",
            deposit_amount=25,
            attributes={"temperature": "185F", "coldPlunge": True},
        ),
        Resource(
            id="res_north_suite",
            business_id="biz_northline",
            name="Courtyard Studio Day Suite",
            resource_type="hotel_room",
            description="Quiet private hotel suite with workspace and courtyard pass.",
            capacity_people=2,
            units_total=3,
            pricing_unit="per_slot",
            slot_duration_minutes=240,
            min_duration_minutes=120,
            max_duration_minutes=480,
            buffer_minutes=30,
            base_price=140,
            currency="USD",
            deposit_amount=30,
            attributes={"wifi": "fiber", "terrace": True, "roomType": "Suite"},
        ),
        Resource(
            id="res_north_deluxe_king",
            business_id="biz_northline",
            name="Northline Deluxe King",
            resource_type="hotel_room",
            description="Quiet overnight hotel room with courtyard views, king bed, and fiber Wi-Fi.",
            capacity_people=2,
            units_total=6,
            pricing_unit="per_night",
            slot_duration_minutes=1440,
            min_duration_minutes=720,
            max_duration_minutes=43200,
            buffer_minutes=60,
            base_price=215,
            currency="USD",
            deposit_amount=45,
            attributes={"roomType": "Double", "bedType": "King"},
        ),
        Resource(
            id="res_volt_bay",
            business_id="biz_volt",
            name="Ceramic Detailing Bay 1",
            resource_type="equipment",
            description="Climate-controlled bay with infrared curing for detailing and ceramic coating.",
            capacity_people=2,
            units_total=2,
            pricing_unit="per_hour",
            slot_duration_minutes=120,
            min_duration_minutes=60,
            max_duration_minutes=480,
            buffer_minutes=30,
            base_price=110,
            currency="USD",
            deposit_amount=25,
            attributes={"area": "Bay Wing", "bayType": "Detailing & Coating"},
        ),
        Resource(
            id="res_passage_van",
            business_id="biz_passage",
            name="Sprinter Transfer Van",
            resource_type="vehicle",
            description="Private chauffeur-driven touring van for Cascade and Puget Sound transfers.",
            capacity_people=8,
            units_total=2,
            pricing_unit="per_hour",
            slot_duration_minutes=120,
            min_duration_minutes=120,
            max_duration_minutes=720,
            buffer_minutes=30,
            base_price=135,
            currency="USD",
            deposit_amount=40,
            attributes={"area": "Downtown Pickup", "passengers": 8},
        ),
    ])

    session.add_all([
        EventOffering(
            id="evt_aura_masterclass",
            business_id="biz_aura",
            booking_model="ticket",
            category="workshop",
            title="Autumn Gloss & Editorial Styling Live",
            description="Live hands-on styling showcase with senior directors.",
            venue_area="Main Studio Floor",
            active=True,
        ),
        EventOffering(
            id="evt_komorebi_wheel",
            business_id="biz_komorebi",
            booking_model="capacity",
            category="class",
            title="Wheel Throwing Foundations",
            description="Small-group stoneware wheel session — clay and kiln glaze included.",
            venue_area="Kiln Room B",
            active=True,
        ),
    ])
    await session.flush()

    session.add_all([
        EventSession(
            id="ses_aura_live_1",
            offering_id="evt_aura_masterclass",
            business_id="biz_aura",
            instructor_employee_id="emp_vance",
            start_at=dt("2026-12-05T18:00:00+00:00"),
            end_at=dt("2026-12-05T20:00:00+00:00"),
            timezone="America/Los_Angeles",
            total_capacity=20,
            reserved_count=0,
            max_per_booking=4,
            status="on_sale",
        ),
        EventSession(
            id="ses_komorebi_wheel_1",
            offering_id="evt_komorebi_wheel",
            business_id="biz_komorebi",
            start_at=dt("2026-12-06T18:00:00+00:00"),
            end_at=dt("2026-12-06T20:00:00+00:00"),
            timezone="America/Los_Angeles",
            total_capacity=8,
            reserved_count=0,
            max_per_booking=4,
            status="on_sale",
        ),
    ])
    await session.flush()

    session.add_all([
        TicketTier(
            id="tier_aura_ga",
            session_id="ses_aura_live_1",
            business_id="biz_aura",
            name="General Admission",
            description="Standing gallery view + styling gift bag",
            price=45,
            currency="USD",
            capacity_limit=14,
            reserved_count=0,
            sort_order=1,
            active=True,
        ),
        TicketTier(
            id="tier_aura_vip",
            session_id="ses_aura_live_1",
            business_id="biz_aura",
            name="VIP Front Row",
            description="Front-row seat + full hair care kit",
            price=95,
            currency="USD",
            capacity_limit=6,
            reserved_count=0,
            sort_order=2,
            active=True,
        ),
        TicketTier(
            id="tier_komorebi_seat",
            session_id="ses_komorebi_wheel_1",
            business_id="biz_komorebi",
            name="Studio Wheel Spot",
            description="Single wheel seat including clay and firing",
            price=68,
            currency="USD",
            capacity_limit=8,
            reserved_count=0,
            sort_order=1,
            active=True,
        ),
    ])
    session.add(
        PromoCode(id="promo_glow", business_id="biz_aura", code="GLOW15", percent_off=15, active=True, expires_on="2026-12-31", redemptions=18)
    )
    session.add(
        Favorite(id="fav_1", user_id="usr_elena", target_type="business", target_id="biz_aura", collection="Weekends")
    )
    session.add(
        Review(
            id="rev_1",
            business_id="biz_aura",
            author_id="usr_elena",
            appointment_id="apt_elena_upcoming",
            rating=5,
            title="Calm and precise",
            body="Elena completely transformed my skin and the room stayed quiet.",
            status="published",
        )
    )
    session.add(
        CustomerNote(
            id="note_1",
            business_id="biz_aura",
            customer_id="usr_elena",
            author_id="usr_elena_vance",
            body="Prefers a low-maintenance gloss. Sensitive along the hairline.",
        )
    )
    session.add(
        Expense(
            id="exp_1",
            business_id="biz_aura",
            category="Rent",
            amount=4200,
            note="November studio rent",
            incurred_on="2026-11-01",
            source="recorded",
        )
    )
    session.add(
        Report(
            id="rpt_1",
            reporter_id="usr_elena",
            target_type="review",
            target_id="rev_1",
            reason="Demo review check",
            details="Sample moderation report for admin queue.",
            status="open",
        )
    )
    session.add(
        Advertisement(
            id="ad_aura_home",
            business_id="biz_aura",
            title="Aura color appointments",
            body="November color seats are open this week.",
            placement="home",
            status="active",
            budget=400,
            starts_at=dt("2026-11-01T00:00:00+00:00"),
            ends_at=dt("2026-12-31T00:00:00+00:00"),
        )
    )
    session.add(
        Notification(
            id="ntf_1",
            user_id="usr_elena",
            business_id="biz_aura",
            category="booking",
            title="Appointment confirmed",
            body="Signature Haircut & Style · Nov 20",
            href="/bookings/apt_elena_upcoming",
        )
    )

    await session.commit()
    print("Seeded BookIt PostgreSQL database successfully.")


async def main() -> None:
    factory = get_session_factory()
    async with factory() as session:
        await seed_database(session)


if __name__ == "__main__":
    asyncio.run(main())
