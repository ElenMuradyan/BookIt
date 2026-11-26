from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies.auth import get_optional_user
from app.core.database import get_db
from app.models.booking import (
    Appointment,
    Booking,
    BusinessBookingConfig,
    CustomerNote,
    EventOffering,
    EventSession,
    Resource,
    ResourceBlock,
)
from app.models.business import Business, BusinessApplication, Membership
from app.models.catalog import Employee, Product, ProductCategory, Service
from app.models.commerce import Cart, Expense, Invoice, Order, Payment, Plan, Subscription
from app.models.engagement import Advertisement, Campaign, Favorite, Notification, PromoCode, Report, Review
from app.models.user import Address, CustomerProfile, User
from app.schemas.auth import AddressOut, CustomerProfileOut, UserOut
from app.schemas.booking import AppointmentOut, CustomerNoteOut, ResourceBlockOut
from app.schemas.business import BusinessApplicationOut, BusinessOut, MembershipOut
from app.schemas.catalog import EmployeeOut, ProductCategoryOut, ProductOut, ProductVariantOut, ServiceOut
from app.schemas.commerce import (
    CartItemOut,
    CartOut,
    ExpenseOut,
    InvoiceOut,
    OrderItemOut,
    OrderOut,
    PaymentOut,
    PlanOut,
    SubscriptionOut,
)
from app.schemas.engagement import (
    AdvertisementOut,
    AnalyticsPointOut,
    BootstrapStateOut,
    CampaignOut,
    FavoriteOut,
    NotificationOut,
    PlatformStatsOut,
    PromoOut,
    ReportOut,
    ReviewOut,
)
from app.api.v1.endpoints.booking_configs import serialize_booking_config
from app.api.v1.endpoints.events import serialize_offering
from app.api.v1.endpoints.resources import serialize_resource
from app.api.v1.endpoints.universal_bookings import serialize_universal_booking
from app.services.auth_service import serialize_profile
from app.services.rbac import has_permission

router = APIRouter(tags=["bootstrap"])


def _redacted_display_user(u: User) -> UserOut:
    """Redact private PII when serializing other users' display profiles (stylists, review authors)."""
    return UserOut(
        id=u.id,
        first_name=u.first_name,
        last_name=u.last_name,
        username=u.username,
        email="redacted@bookit.app",
        phone="hidden",
        avatar_url=u.avatar_url,
        location=u.location,
        language=u.language,
        interests=[],
        email_verified=u.email_verified,
        phone_verified=False,
        status=u.status,
        is_platform_admin=False,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


@router.get("/bootstrap", response_model=BootstrapStateOut)
async def bootstrap_state(
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    is_admin = bool(user and user.is_platform_admin)

    # Memberships for current user (or all for admin)
    user_business_ids: set[str] = set()
    memberships: list[Membership] = []
    if user:
        if is_admin:
            memberships = list((await db.execute(select(Membership))).scalars().all())
        else:
            memberships = list(
                (await db.execute(select(Membership).where(Membership.user_id == user.id))).scalars().all()
            )
        user_business_ids = {m.business_id for m in memberships if m.status != "suspended"}

    # Businesses: public approved OR owned/member businesses OR all if admin
    if is_admin:
        businesses = list((await db.execute(select(Business))).scalars().all())
    elif user_business_ids:
        businesses = list(
            (
                await db.execute(
                    select(Business).where(
                        or_(
                            (Business.is_public.is_(True) & (Business.status == "approved")),
                            Business.id.in_(user_business_ids),
                            Business.owner_user_id == user.id,  # type: ignore[union-attr]
                        )
                    )
                )
            ).scalars().all()
        )
    else:
        businesses = list(
            (
                await db.execute(
                    select(Business).where(Business.is_public.is_(True), Business.status == "approved")
                )
            ).scalars().all()
        )
    visible_biz_ids = {b.id for b in businesses}

    owned_business_ids: set[str] = {b.id for b in businesses if user and b.owner_user_id == user.id}
    active_memberships = [
        m for m in memberships if user and m.user_id == user.id and m.status == "active"
    ]
    active_user_business_ids: set[str] = owned_business_ids | {m.business_id for m in active_memberships}
    service_manage_business_ids: set[str] = owned_business_ids | {
        m.business_id for m in active_memberships if has_permission(m.role, "services.manage")
    }
    product_manage_business_ids: set[str] = owned_business_ids | {
        m.business_id for m in active_memberships if has_permission(m.role, "products.manage")
    }
    resource_manage_business_ids: set[str] = owned_business_ids | {
        m.business_id for m in active_memberships if has_permission(m.role, "resources.manage")
    }
    event_manage_business_ids: set[str] = owned_business_ids | {
        m.business_id for m in active_memberships if has_permission(m.role, "events.manage")
    }

    # Services & Employees for visible businesses
    services = list(
        (
            await db.execute(
                select(Service).options(selectinload(Service.employees)).where(Service.business_id.in_(visible_biz_ids))
            )
        ).scalars().all()
    ) if visible_biz_ids else []
    if not is_admin:
        services = [s for s in services if s.active or s.business_id in service_manage_business_ids]
    employees = list(
        (
            await db.execute(
                select(Employee).options(selectinload(Employee.services)).where(Employee.business_id.in_(visible_biz_ids))
            )
        ).scalars().all()
    ) if visible_biz_ids else []

    categories = list((await db.execute(select(ProductCategory))).scalars().all())
    products = list(
        (
            await db.execute(
                select(Product).options(selectinload(Product.variants)).where(Product.business_id.in_(visible_biz_ids))
            )
        ).scalars().all()
    ) if visible_biz_ids else []
    if not is_admin:
        products = [p for p in products if p.active or p.business_id in product_manage_business_ids]

    plans = list((await db.execute(select(Plan))).scalars().all())
    ads = list(
        (await db.execute(select(Advertisement).where(Advertisement.status == "active" if not is_admin else True))).scalars().all()
    )
    reviews = list(
        (
            await db.execute(
                select(Review).where(Review.status == "published" if not is_admin else True)
            )
        ).scalars().all()
    )

    # Phase 2 Booking Configs, Resources & Event Offerings for visible businesses
    booking_configs = list(
        (
            await db.execute(
                select(BusinessBookingConfig).where(BusinessBookingConfig.business_id.in_(visible_biz_ids))
            )
        ).scalars().all()
    ) if visible_biz_ids else []
    if not is_admin:
        booking_configs = [
            c for c in booking_configs if c.enabled or c.business_id in active_user_business_ids
        ]

    resources = list(
        (
            await db.execute(select(Resource).where(Resource.business_id.in_(visible_biz_ids)))
        ).scalars().all()
    ) if visible_biz_ids else []
    if not is_admin:
        resources = [r for r in resources if r.active or r.business_id in resource_manage_business_ids]

    resource_blocks: list[ResourceBlock] = []
    if user and (is_admin or resource_manage_business_ids):
        rb_stmt = select(ResourceBlock).join(Resource, Resource.id == ResourceBlock.resource_id)
        if not is_admin:
            rb_stmt = rb_stmt.where(Resource.business_id.in_(resource_manage_business_ids))
        resource_blocks = list((await db.execute(rb_stmt.order_by(ResourceBlock.start_at.asc()))).scalars().all())

    event_offerings = list(
        (
            await db.execute(
                select(EventOffering)
                .options(selectinload(EventOffering.sessions).selectinload(EventSession.tiers))
                .where(EventOffering.business_id.in_(visible_biz_ids))
            )
        ).scalars().all()
    ) if visible_biz_ids else []
    if not is_admin:
        event_offerings = [o for o in event_offerings if o.active or o.business_id in event_manage_business_ids]

    # Authenticated user-scoped / workspace-scoped records
    profiles_out: list[CustomerProfileOut] = []
    addresses_out: list[AddressOut] = []
    carts_out: list[CartOut] = []
    appointments: list[Appointment] = []
    universal_bookings: list[Booking] = []
    orders: list[Order] = []
    payments: list[Payment] = []
    notifications: list[Notification] = []
    favorites: list[Favorite] = []
    applications: list[BusinessApplication] = []
    subscriptions: list[Subscription] = []
    invoices: list[Invoice] = []
    expenses: list[Expense] = []
    promos: list[PromoCode] = []
    campaigns: list[Campaign] = []
    notes: list[CustomerNote] = []
    reports: list[Report] = []

    if user:
        prof = await db.get(CustomerProfile, user.id)
        if prof:
            p_out = serialize_profile(prof)
            if p_out:
                profiles_out.append(p_out)

        addresses_out = [
            AddressOut.model_validate(a)
            for a in (await db.execute(select(Address).where(Address.user_id == user.id))).scalars().all()
        ]
        user_cart = (
            await db.execute(select(Cart).options(selectinload(Cart.items)).where(Cart.user_id == user.id))
        ).scalar_one_or_none()
        if user_cart:
            carts_out.append(
                CartOut(
                    id=user_cart.id,
                    user_id=user_cart.user_id,
                    items=[
                        CartItemOut(
                            id=i.id,
                            product_id=i.product_id,
                            variant_id=i.variant_id,
                            quantity=i.quantity,
                            seller_id=i.seller_id,
                        )
                        for i in user_cart.items
                    ],
                    updated_at=user_cart.updated_at,
                )
            )
        favorites = list((await db.execute(select(Favorite).where(Favorite.user_id == user.id))).scalars().all())

        if is_admin:
            appointments = list((await db.execute(select(Appointment))).scalars().all())
            universal_bookings = list(
                (
                    await db.execute(
                        select(Booking).options(
                            selectinload(Booking.resource_allocations),
                            selectinload(Booking.ticket_passes),
                        )
                    )
                ).scalars().all()
            )
            orders = list((await db.execute(select(Order).options(selectinload(Order.items)))).scalars().all())
            payments = list((await db.execute(select(Payment))).scalars().all())
            notifications = list((await db.execute(select(Notification))).scalars().all())
            applications = list((await db.execute(select(BusinessApplication))).scalars().all())
            subscriptions = list((await db.execute(select(Subscription))).scalars().all())
            invoices = list((await db.execute(select(Invoice))).scalars().all())
            expenses = list((await db.execute(select(Expense))).scalars().all())
            promos = list((await db.execute(select(PromoCode))).scalars().all())
            campaigns = list((await db.execute(select(Campaign))).scalars().all())
            notes = list((await db.execute(select(CustomerNote))).scalars().all())
            reports = list((await db.execute(select(Report))).scalars().all())
        else:
            appt_cond = Appointment.customer_id == user.id
            order_cond = Order.user_id == user.id
            pay_cond = Payment.payer_id == user.id
            ntf_cond = Notification.user_id == user.id
            if user_business_ids:
                appt_cond = or_(appt_cond, Appointment.business_id.in_(user_business_ids))
                order_cond = or_(order_cond, Order.seller_id.in_(user_business_ids))
                pay_cond = or_(pay_cond, Payment.business_id.in_(user_business_ids))
                ntf_cond = or_(ntf_cond, Notification.business_id.in_(user_business_ids))
                memberships = list(
                    (
                        await db.execute(
                            select(Membership).where(
                                or_(Membership.user_id == user.id, Membership.business_id.in_(user_business_ids))
                            )
                        )
                    ).scalars().all()
                )
                applications = list(
                    (
                        await db.execute(
                            select(BusinessApplication).where(BusinessApplication.business_id.in_(user_business_ids))
                        )
                    ).scalars().all()
                )
                subscriptions = list(
                    (await db.execute(select(Subscription).where(Subscription.business_id.in_(user_business_ids)))).scalars().all()
                )
                invoices = list(
                    (await db.execute(select(Invoice).where(Invoice.business_id.in_(user_business_ids)))).scalars().all()
                )
                expenses = list(
                    (await db.execute(select(Expense).where(Expense.business_id.in_(user_business_ids)))).scalars().all()
                )
                promos = list(
                    (await db.execute(select(PromoCode).where(PromoCode.business_id.in_(user_business_ids)))).scalars().all()
                )
                campaigns = list(
                    (await db.execute(select(Campaign).where(Campaign.business_id.in_(user_business_ids)))).scalars().all()
                )
                notes = list(
                    (await db.execute(select(CustomerNote).where(CustomerNote.business_id.in_(user_business_ids)))).scalars().all()
                )

            appointments = list((await db.execute(select(Appointment).where(appt_cond))).scalars().all())
            ub_cond = Booking.customer_id == user.id
            if user_business_ids:
                ub_cond = or_(ub_cond, Booking.business_id.in_(user_business_ids))
            universal_bookings = list(
                (
                    await db.execute(
                        select(Booking)
                        .options(
                            selectinload(Booking.resource_allocations),
                            selectinload(Booking.ticket_passes),
                        )
                        .where(ub_cond)
                    )
                ).scalars().all()
            )
            orders = list(
                (await db.execute(select(Order).options(selectinload(Order.items)).where(order_cond))).scalars().all()
            )
            payments = list((await db.execute(select(Payment).where(pay_cond))).scalars().all())
            notifications = list(
                (await db.execute(select(Notification).where(ntf_cond).order_by(Notification.created_at.desc()))).scalars().all()
            )

    # Display users needed for staff names, review authors, and customer names in workspaces
    needed_user_ids: set[str] = {e.user_id for e in employees} | {r.author_id for r in reviews}
    if user:
        needed_user_ids.add(user.id)
        for a in appointments:
            needed_user_ids.add(a.customer_id)
        for b in universal_bookings:
            needed_user_ids.add(b.customer_id)
        for o in orders:
            needed_user_ids.add(o.user_id)
        for m in memberships:
            needed_user_ids.add(m.user_id)

    if is_admin:
        db_users = list((await db.execute(select(User))).scalars().all())
        users_out = [UserOut.model_validate(u) for u in db_users]
    elif needed_user_ids:
        db_users = list((await db.execute(select(User).where(User.id.in_(needed_user_ids)))).scalars().all())
        users_out = [
            UserOut.model_validate(u) if (user and u.id == user.id) else _redacted_display_user(u)
            for u in db_users
        ]
    else:
        users_out = []

    if is_admin:
        total_users = int((await db.execute(select(func.count(User.id)))).scalar_one())
        total_businesses = int((await db.execute(select(func.count(Business.id)))).scalar_one())
        pending_apps = int(
            (
                await db.execute(
                    select(func.count(BusinessApplication.id)).where(
                        BusinessApplication.status.in_(["submitted", "under_review"])
                    )
                )
            ).scalar_one()
        )
        approved_biz = int(
            (await db.execute(select(func.count(Business.id)).where(Business.status == "approved"))).scalar_one()
        )
        total_bookings = int((await db.execute(select(func.count(Booking.id)))).scalar_one()) + int(
            (await db.execute(select(func.count(Appointment.id)).where(Appointment.booking_id.is_(None)))).scalar_one()
        )
        total_orders = int((await db.execute(select(func.count(Order.id)))).scalar_one())
        recorded_rev = float(
            (await db.execute(select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.status == "recorded"))).scalar_one()
        )
        active_subs = int(
            (
                await db.execute(
                    select(func.count(Subscription.id)).where(Subscription.status.in_(["active", "trialing"]))
                )
            ).scalar_one()
        )
    else:
        total_users = 0
        total_businesses = len(businesses)
        pending_apps = 0
        approved_biz = sum(1 for b in businesses if b.status == "approved")
        total_bookings = 0
        total_orders = 0
        recorded_rev = 0.0
        active_subs = 0

    return BootstrapStateOut(
        users=users_out,
        customer_profiles=profiles_out,
        addresses=addresses_out,
        memberships=[MembershipOut.model_validate(m) for m in memberships],
        businesses=[BusinessOut.model_validate(b) for b in businesses],
        applications=[BusinessApplicationOut.model_validate(a) for a in applications],
        services=[
            ServiceOut(
                id=s.id,
                business_id=s.business_id,
                name=s.name,
                description=s.description,
                category=s.category,
                price=float(s.price),
                currency=s.currency,
                duration_minutes=s.duration_minutes,
                image_url=s.image_url,
                employee_ids=[e.id for e in s.employees],
                active=s.active,
                deposit_amount=float(s.deposit_amount) if s.deposit_amount is not None else None,
                requires_approval=s.requires_approval,
                cancellation_policy=s.cancellation_policy,
            )
            for s in services
        ],
        employees=[
            EmployeeOut(
                id=e.id,
                business_id=e.business_id,
                user_id=e.user_id,
                membership_id=e.membership_id,
                title=e.title,
                bio=e.bio,
                service_ids=[s.id for s in e.services],
                hours=e.hours,  # type: ignore[arg-type]
                status=e.status,  # type: ignore[arg-type]
                rating=e.rating,
            )
            for e in employees
        ],
        appointments=[
            AppointmentOut(
                id=a.id,
                booking_id=a.booking_id,
                business_id=a.business_id,
                service_id=a.service_id,
                employee_id=a.employee_id,
                customer_id=a.customer_id,
                start=a.start_at,
                end=a.end_at,
                status=a.status,
                price=float(a.price),
                currency=a.currency,
                payment_status=a.payment_status,
                payment_method=a.payment_method,
                confirmation_mode=a.confirmation_mode,
                notes=a.notes,
                check_in_code=a.check_in_code,
                checked_in_at=a.checked_in_at,
                created_at=a.created_at,
            )
            for a in appointments
        ],
        booking_configs=[serialize_booking_config(c) for c in booking_configs],
        resources=[serialize_resource(r) for r in resources],
        resource_blocks=[ResourceBlockOut.model_validate(rb) for rb in resource_blocks],
        event_offerings=[serialize_offering(o) for o in event_offerings],
        bookings=[serialize_universal_booking(b) for b in universal_bookings],
        reviews=[ReviewOut.model_validate(r) for r in reviews],
        product_categories=[ProductCategoryOut.model_validate(c) for c in categories],
        products=[
            ProductOut(
                id=p.id,
                business_id=p.business_id,
                category_id=p.category_id,
                name=p.name,
                description=p.description,
                price=float(p.price),
                compare_at_price=float(p.compare_at_price) if p.compare_at_price is not None else None,
                currency=p.currency,
                image_url=p.image_url,
                images=p.images or [],  # type: ignore[arg-type]
                stock=p.stock,
                active=p.active,
                variants=[
                    ProductVariantOut(
                        id=v.id,
                        sku=v.sku,
                        label=v.label,
                        stock=v.stock,
                        price_delta=float(v.price_delta),
                        size=v.size,
                        color=v.color,
                    )
                    for v in p.variants
                ],
                rating=p.rating,
                review_count=p.review_count,
                created_at=p.created_at,
                featured=p.featured,
                popular=p.popular,
                discount_label=p.discount_label,
            )
            for p in products
        ],
        carts=carts_out,
        orders=[
            OrderOut(
                id=o.id,
                checkout_group_id=o.checkout_group_id,
                user_id=o.user_id,
                seller_id=o.seller_id,
                items=[
                    OrderItemOut(
                        id=i.id,
                        product_id=i.product_id,
                        variant_id=i.variant_id,
                        name=i.name,
                        quantity=i.quantity,
                        unit_price=float(i.unit_price),
                        seller_id=i.seller_id,
                    )
                    for i in o.items
                ],
                status=o.status,
                payment_status=o.payment_status,
                payment_method=o.payment_method,
                subtotal=float(o.subtotal),
                delivery_fee=float(o.delivery_fee),
                total=float(o.total),
                currency=o.currency,
                address_id=o.address_id,
                delivery_method=o.delivery_method,
                tracking_placeholder=o.tracking_placeholder,
                created_at=o.created_at,
                updated_at=o.updated_at,
            )
            for o in orders
        ],
        payments=[
            PaymentOut(
                id=p.id,
                payer_id=p.payer_id,
                business_id=p.business_id,
                amount=float(p.amount),
                currency=p.currency,
                status=p.status,
                method=p.method,
                reference_type=p.reference_type,
                reference_id=p.reference_id,
                provider=p.provider,
                provider_reference=p.provider_reference,
                note=p.note,
                created_at=p.created_at,
            )
            for p in payments
        ],
        plans=[
            PlanOut(
                id=pl.id,
                name=pl.name,
                monthly_price=float(pl.monthly_price),
                description=pl.description,
                features=pl.features or [],
            )
            for pl in plans
        ],
        subscriptions=[SubscriptionOut.model_validate(s) for s in subscriptions],
        invoices=[
            InvoiceOut(
                id=inv.id,
                business_id=inv.business_id,
                amount=float(inv.amount),
                status=inv.status,
                description=inv.description,
                issued_at=inv.issued_at,
            )
            for inv in invoices
        ],
        notifications=[NotificationOut.model_validate(n) for n in notifications],
        expenses=[
            ExpenseOut(
                id=ex.id,
                business_id=ex.business_id,
                category=ex.category,
                amount=float(ex.amount),
                note=ex.note,
                incurred_on=ex.incurred_on,
                source=ex.source,
            )
            for ex in expenses
        ],
        advertisements=[AdvertisementOut.model_validate(ad) for ad in ads],
        reports=[ReportOut.model_validate(rp) for rp in reports],
        favorites=[FavoriteOut.model_validate(fv) for fv in favorites],
        promo_codes=[PromoOut.model_validate(pr) for pr in promos],
        campaigns=[CampaignOut.model_validate(cm) for cm in campaigns],
        notes=[CustomerNoteOut.model_validate(nt) for nt in notes],
        platform_stats=PlatformStatsOut(
            total_users=int(total_users),
            total_businesses=int(total_businesses),
            pending_applications=int(pending_apps),
            approved_businesses=int(approved_biz),
            total_bookings=int(total_bookings),
            total_orders=int(total_orders),
            platform_revenue=float(recorded_rev),
            active_subscriptions=int(active_subs),
            user_delta="Live PostgreSQL count",
            business_delta="Live PostgreSQL count",
            subscription_note="Active & trialing",
            revenue_delta="Recorded payments",
            source="database_aggregate",
        ),
        revenue_series=[
            AnalyticsPointOut(label="Bookings", value=float(total_bookings)),
            AnalyticsPointOut(label="Orders", value=float(total_orders)),
            AnalyticsPointOut(label="Revenue", value=float(recorded_rev)),
        ],
        booking_series=[
            AnalyticsPointOut(label="Total", value=float(total_bookings)),
        ],
        growth_series=[
            AnalyticsPointOut(label="Users", value=float(total_users)),
            AnalyticsPointOut(label="Businesses", value=float(total_businesses)),
        ],
    )
