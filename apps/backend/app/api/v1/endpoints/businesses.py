from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_optional_user, require_user, verify_csrf_if_cookie_auth
from app.core.config import get_settings
from app.core.database import get_db
from app.core.rate_limit import auth_rate_limiter, client_ip_from_request
from app.core.security import hash_password
from app.models.base import new_id, utc_now
from app.models.business import Business, BusinessApplication, Membership
from app.models.catalog import Employee, Service
from app.models.commerce import Cart
from app.models.engagement import Notification
from app.models.user import CustomerProfile, User
from app.schemas.business import (
    BlockedSlotIn,
    BusinessApplicationCreateIn,
    BusinessApplicationOut,
    BusinessOut,
    BusinessUpdateIn,
    HolidaySchema,
    PublicBusinessOut,
    WeeklyHoursSchema,
)
from app.services.auth_service import issue_email_verification, record_audit, send_verification_email
from app.services.booking_config_service import seed_booking_configs_for_category
from app.services.notification_service import EmailDeliveryError, ensure_email_provider_ready
from app.services.rbac import ensure_business_visible, require_business_permission

router = APIRouter(prefix="/businesses", tags=["businesses"])


def _default_hours() -> dict:
    weekday = {"closed": False, "open": "09:00", "close": "17:00"}
    weekend = {"closed": True, "open": "00:00", "close": "00:00"}
    return {"mon": weekday, "tue": weekday, "wed": weekday, "thu": weekday, "fri": weekday, "sat": weekend, "sun": weekend}


@router.get("", response_model=list[PublicBusinessOut])
async def list_public_businesses(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str | None = None,
    category: str | None = None,
    min_rating: float | None = Query(default=None, ge=0, le=5),
    cuisine: str | None = None,
    specialty: str | None = None,
    sort: str = "rating",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(Business).where(Business.is_public.is_(True), Business.status == "approved")
    if category:
        stmt = stmt.where(Business.category == category)
    if min_rating is not None:
        stmt = stmt.where(Business.rating >= min_rating)
    if cuisine:
        stmt = stmt.where(Business.cuisine == cuisine)
    if specialty:
        stmt = stmt.where(Business.specialty == specialty)
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                Business.name.ilike(like),
                Business.description.ilike(like),
                Business.city.ilike(like),
                Business.category.ilike(like),
            )
        )
    if sort == "distance":
        stmt = stmt.order_by(Business.distance_miles.asc())
    else:
        stmt = stmt.order_by(Business.rating.desc())
    stmt = stmt.offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [PublicBusinessOut.model_validate(b) for b in rows]


@router.get("/{business_id}", response_model=PublicBusinessOut | BusinessOut)
async def get_business(
    business_id: str,
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business = await db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    if user and (user.is_platform_admin or business.owner_user_id == user.id):
        return BusinessOut.model_validate(business)
    if user:
        member = (
            await db.execute(
                select(Membership).where(
                    Membership.user_id == user.id,
                    Membership.business_id == business.id,
                    Membership.status == "active",
                )
            )
        ).scalar_one_or_none()
        if member:
            return BusinessOut.model_validate(business)

    if not business.is_public or business.status != "approved":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    return PublicBusinessOut.model_validate(business)


@router.post("/applications", response_model=BusinessApplicationOut, status_code=status.HTTP_201_CREATED)
async def submit_business_application(
    payload: BusinessApplicationCreateIn,
    request: Request,
    _: Annotated[None, Depends(verify_csrf_if_cookie_auth)],
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    settings = get_settings()
    ip = client_ip_from_request(request)
    await auth_rate_limiter.check(
        f"biz-apply:{ip}",
        min(settings.auth_rate_limit_max_attempts, 6),
        settings.auth_rate_limit_window_seconds,
    )
    try:
        payload.validate_passwords()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    created_new_owner = False
    owner: User | None = current_user
    owner_email = payload.owner_email.strip().lower()
    if not owner:
        existing = (await db.execute(select(User).where(User.email == owner_email))).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="An account already exists for that owner email. Please sign in first.",
            )
        if not payload.owner_password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Create an owner password to sign in to your business workspace",
            )
        try:
            ensure_email_provider_ready()
        except EmailDeliveryError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        parts = payload.owner_name.strip().split(" ")
        first_name = parts[0] or "Owner"
        last_name = " ".join(parts[1:]) or "Account"
        owner = User(
            id=new_id("usr"),
            first_name=first_name,
            last_name=last_name,
            username=f"owner_{new_id('u')[2:10]}",
            email=owner_email,
            phone=payload.owner_phone.strip(),
            password_hash=hash_password(payload.owner_password),
            language="English",
            interests=[],
            status="active",
        )
        db.add(owner)
        try:
            await db.flush()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account already exists for that owner email. Please sign in first.",
            ) from exc
        db.add(CustomerProfile(user_id=owner.id))
        db.add(Cart(id=new_id("cart"), user_id=owner.id))
        await db.flush()
        created_new_owner = True
    elif not owner.email_verified:
        try:
            ensure_email_provider_ready()
        except EmailDeliveryError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    norm_name = payload.business_name.strip().lower()
    norm_legal = payload.legal_name.strip().lower()
    norm_city = payload.city.strip().lower()
    duplicate_app = (
        await db.execute(
            select(Business.id).where(
                Business.owner_user_id == owner.id,
                Business.status != "rejected",
                func.lower(func.trim(Business.name)) == norm_name,
                func.lower(func.trim(Business.legal_name)) == norm_legal,
                func.lower(func.trim(Business.city)) == norm_city,
            )
        )
    ).scalar_one_or_none()
    if duplicate_app:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active or pending application already exists for this business",
        )

    business = Business(
        id=new_id("biz"),
        owner_user_id=owner.id,
        name=payload.business_name.strip(),
        legal_name=payload.legal_name.strip(),
        category=payload.category.strip(),
        description=payload.description.strip(),
        country=payload.country.strip(),
        city=payload.city.strip(),
        address=payload.address.strip(),
        timezone="America/Los_Angeles",
        location={
            "id": new_id("loc"),
            "label": "Primary",
            "line1": payload.address.strip(),
            "city": payload.city.strip(),
            "region": "",
            "postalCode": "",
            "country": payload.country.strip(),
            "geo": {"lat": 47.6, "lng": -122.33},
        },
        phone=payload.phone.strip(),
        email=payload.email.strip().lower(),
        website=payload.website or None,
        hours=_default_hours(),
        status="submitted",
        is_public=False,
    )
    db.add(business)
    await db.flush()
    await seed_booking_configs_for_category(db, business, commit=False)

    application = BusinessApplication(
        id=new_id("app"),
        business_id=business.id,
        applicant_user_id=owner.id,
        status="submitted",
        submitted_at=utc_now(),
        documents=[{"id": new_id("doc"), "name": "Verification packet.pdf", "kind": "license", "state": "placeholder"}],
    )
    membership = Membership(
        id=new_id("mem"),
        user_id=owner.id,
        business_id=business.id,
        role="owner",
        status="active",
        title="Owner",
    )
    notification = Notification(
        id=new_id("ntf"),
        user_id=owner.id,
        business_id=business.id,
        category="message",
        title="Business application submitted",
        body=f"{business.name} is queued for platform review. You can configure your booking setup and hours now.",
        href="/workspace/settings",
    )
    db.add_all([application, membership, notification])
    verification_issued: tuple[str, str] | None = None
    if created_new_owner or not owner.email_verified:
        verification_issued = await issue_email_verification(
            db,
            owner,
            enforce_cooldown_error=False,
            commit=False,
        )
    await record_audit(
        db,
        actor_user_id=owner.id,
        action="business.application_submitted",
        target_type="business",
        target_id=business.id,
    )
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for that owner email. Please sign in first.",
        ) from exc

    if verification_issued:
        try:
            await send_verification_email(
                to_email=owner.email,
                code=verification_issued[0],
                link_token=verification_issued[1],
            )
        except EmailDeliveryError as exc:
            await db.rollback()
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    await db.commit()
    await db.refresh(application)
    return BusinessApplicationOut.model_validate(application)


@router.patch("/{business_id}", response_model=BusinessOut)
async def update_business_profile(
    business_id: str,
    payload: BusinessUpdateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, _ = await require_business_permission(db, user, business_id, "settings.profile")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(business, field, value)
    await db.commit()
    await db.refresh(business)
    return BusinessOut.model_validate(business)


@router.put("/{business_id}/hours", response_model=BusinessOut)
async def update_business_hours(
    business_id: str,
    payload: WeeklyHoursSchema,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, _ = await require_business_permission(db, user, business_id, "calendar.manage")
    business.hours = payload.model_dump()
    await db.commit()
    await db.refresh(business)
    return BusinessOut.model_validate(business)


@router.post("/{business_id}/holidays", response_model=BusinessOut)
async def add_holiday(
    business_id: str,
    payload: HolidaySchema,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, _ = await require_business_permission(db, user, business_id, "calendar.manage")
    holidays = list(business.holidays or [])
    if not any(h.get("date") == payload.date for h in holidays):
        holidays.append(payload.model_dump())
        business.holidays = holidays
        await db.commit()
        await db.refresh(business)
    return BusinessOut.model_validate(business)


@router.delete("/{business_id}/holidays/{holiday_date}", response_model=BusinessOut)
async def remove_holiday(
    business_id: str,
    holiday_date: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, _ = await require_business_permission(db, user, business_id, "calendar.manage")
    business.holidays = [h for h in (business.holidays or []) if h.get("date") != holiday_date]
    await db.commit()
    await db.refresh(business)
    return BusinessOut.model_validate(business)


@router.post("/{business_id}/blocked", response_model=BusinessOut)
async def add_blocked_slot(
    business_id: str,
    payload: BlockedSlotIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.start >= payload.end:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="End time must be after start time")
    business, _ = await require_business_permission(db, user, business_id, "calendar.manage")
    blocked = list(business.blocked or [])
    blocked.append({"id": new_id("blk"), **payload.model_dump()})
    business.blocked = blocked
    await db.commit()
    await db.refresh(business)
    return BusinessOut.model_validate(business)


@router.delete("/{business_id}/blocked/{block_id}", response_model=BusinessOut)
async def remove_blocked_slot(
    business_id: str,
    block_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, _ = await require_business_permission(db, user, business_id, "calendar.manage")
    business.blocked = [b for b in (business.blocked or []) if b.get("id") != block_id]
    await db.commit()
    await db.refresh(business)
    return BusinessOut.model_validate(business)


@router.get("/{business_id}/services")
async def list_business_services(
    business_id: str,
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from sqlalchemy.orm import selectinload

    from app.schemas.catalog import ServiceOut

    _, is_member = await ensure_business_visible(db, business_id, user)
    stmt = select(Service).options(selectinload(Service.employees)).where(Service.business_id == business_id)
    if not is_member:
        stmt = stmt.where(Service.active.is_(True))
    rows = (await db.execute(stmt)).scalars().all()
    return [
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
        for s in rows
    ]


@router.get("/{business_id}/staff")
async def list_business_staff(
    business_id: str,
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from sqlalchemy.orm import selectinload

    from app.schemas.catalog import EmployeeOut

    await ensure_business_visible(db, business_id, user)
    rows = (
        await db.execute(
            select(Employee)
            .options(selectinload(Employee.services))
            .where(Employee.business_id == business_id)
        )
    ).scalars().all()
    return [
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
        for e in rows
    ]
