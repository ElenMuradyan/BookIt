from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies.auth import get_optional_user, require_user
from app.core.database import get_db
from app.models.base import new_id
from app.models.booking import Booking, EventOffering, EventSession, Resource, TicketPass, TicketTier
from app.models.catalog import Employee
from app.models.user import User
from app.schemas.booking import (
    EventOfferingIn,
    EventOfferingOut,
    EventOfferingUpdateIn,
    EventSessionIn,
    EventSessionOut,
    EventSessionUpdateIn,
    SessionAttendeeOut,
    TicketTierIn,
    TicketTierOut,
    TicketTierUpdateIn,
)
from app.services.rbac import (
    ensure_business_visible,
    get_active_membership,
    has_permission,
    require_business_permission,
)
router = APIRouter(tags=["events"])


def serialize_tier(t: TicketTier) -> TicketTierOut:
    remaining = max(0, t.capacity_limit - t.reserved_count) if t.capacity_limit is not None else None
    return TicketTierOut(
        id=t.id,
        session_id=t.session_id,
        name=t.name,
        description=t.description,
        price=float(t.price),
        currency=t.currency,
        capacity_limit=t.capacity_limit,
        reserved_count=t.reserved_count,
        remaining=remaining,
        sort_order=t.sort_order,
        active=t.active,
    )


def serialize_session(s: EventSession) -> EventSessionOut:
    return EventSessionOut(
        id=s.id,
        offering_id=s.offering_id,
        business_id=s.business_id,
        instructor_employee_id=s.instructor_employee_id,
        resource_id=s.resource_id,
        title_override=s.title_override,
        start_at=s.start_at,
        end_at=s.end_at,
        timezone=s.timezone,
        sales_start_at=s.sales_start_at,
        sales_end_at=s.sales_end_at,
        total_capacity=s.total_capacity,
        reserved_count=s.reserved_count,
        remaining_capacity=max(0, s.total_capacity - s.reserved_count),
        max_per_booking=s.max_per_booking,
        status=s.status,
        tiers=[serialize_tier(t) for t in (s.tiers or [])],
    )


def serialize_offering(off: EventOffering) -> EventOfferingOut:
    return EventOfferingOut(
        id=off.id,
        business_id=off.business_id,
        booking_model=off.booking_model,  # type: ignore[arg-type]
        category=off.category,
        title=off.title,
        description=off.description,
        venue_area=off.venue_area,
        image_url=off.image_url,
        cancellation_policy=off.cancellation_policy,
        active=off.active,
        metadata_json=off.metadata_json or {},
        sessions=[serialize_session(s) for s in (off.sessions or [])],
    )


@router.get("/businesses/{business_id}/offerings", response_model=list[EventOfferingOut])
async def list_offerings(
    business_id: str,
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    booking_model: str | None = Query(default=None, alias="bookingModel"),
    include_inactive: bool = Query(default=False, alias="includeInactive"),
):
    business, _ = await ensure_business_visible(db, business_id, user)
    stmt = (
        select(EventOffering)
        .options(selectinload(EventOffering.sessions).selectinload(EventSession.tiers))
        .where(EventOffering.business_id == business.id)
    )

    can_view_inactive = False

    if include_inactive and user:
        if user.is_platform_admin or business.owner_user_id == user.id:
            can_view_inactive = True
        else:
            membership = await get_active_membership(db, user.id, business.id)
            can_view_inactive = bool(
                membership and has_permission(membership.role, "events.manage")
            )

    if not can_view_inactive:
        stmt = stmt.where(EventOffering.active.is_(True))

    if booking_model:
        stmt = stmt.where(EventOffering.booking_model == booking_model)

    stmt = stmt.order_by(EventOffering.created_at.desc())

    rows = (await db.execute(stmt)).scalars().all()
    return [serialize_offering(o) for o in rows]

@router.post("/businesses/{business_id}/offerings", response_model=EventOfferingOut, status_code=status.HTTP_201_CREATED)
async def create_offering(
    business_id: str,
    payload: EventOfferingIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, _ = await require_business_permission(db, user, business_id, "events.manage")
    off = EventOffering(
        id=new_id("evt"),
        business_id=business.id,
        booking_model=payload.booking_model,
        category=payload.category.strip(),
        title=payload.title.strip(),
        description=payload.description.strip(),
        venue_area=payload.venue_area.strip() if payload.venue_area else None,
        image_url=payload.image_url,
        cancellation_policy=payload.cancellation_policy.strip(),
        active=payload.active,
        metadata_json=payload.metadata_json,
    )
    db.add(off)
    await db.commit()
    loaded = (
        await db.execute(
            select(EventOffering)
            .options(selectinload(EventOffering.sessions).selectinload(EventSession.tiers))
            .where(EventOffering.id == off.id)
        )
    ).scalar_one()
    return serialize_offering(loaded)


@router.patch("/businesses/{business_id}/offerings/{offering_id}", response_model=EventOfferingOut)
async def update_offering(
    business_id: str,
    offering_id: str,
    payload: EventOfferingUpdateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "events.manage")
    off = (
        await db.execute(
            select(EventOffering)
            .options(selectinload(EventOffering.sessions).selectinload(EventSession.tiers))
            .where(EventOffering.id == offering_id, EventOffering.business_id == business_id)
        )
    ).scalar_one_or_none()
    if not off:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offering not found")

    for k, v in payload.model_dump(exclude_unset=True).items():
        if isinstance(v, str):
            v = v.strip()
        setattr(off, k, v)
    await db.commit()
    loaded = (
        await db.execute(
            select(EventOffering)
            .options(selectinload(EventOffering.sessions).selectinload(EventSession.tiers))
            .where(EventOffering.id == off.id)
        )
    ).scalar_one()
    return serialize_offering(loaded)


@router.post(
    "/businesses/{business_id}/offerings/{offering_id}/sessions",
    response_model=EventSessionOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_session(
    business_id: str,
    offering_id: str,
    payload: EventSessionIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, _ = await require_business_permission(db, user, business_id, "events.manage")
    off = await db.get(EventOffering, offering_id)
    if not off or off.business_id != business.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offering not found")
    if payload.end_at <= payload.start_at:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="endAt must be after startAt")

    if payload.instructor_employee_id:
        emp = await db.get(Employee, payload.instructor_employee_id)
        if not emp or emp.business_id != business.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instructor does not belong to business")
    if payload.resource_id:
        res = await db.get(Resource, payload.resource_id)
        if not res or res.business_id != business.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource does not belong to business")

    ses = EventSession(
        id=new_id("ses"),
        offering_id=off.id,
        business_id=business.id,
        instructor_employee_id=payload.instructor_employee_id,
        resource_id=payload.resource_id,
        title_override=payload.title_override.strip() if payload.title_override else None,
        start_at=payload.start_at,
        end_at=payload.end_at,
        timezone=payload.timezone or business.timezone,
        sales_start_at=payload.sales_start_at,
        sales_end_at=payload.sales_end_at,
        total_capacity=payload.total_capacity,
        reserved_count=0,
        max_per_booking=payload.max_per_booking,
        status=payload.status,
    )
    db.add(ses)
    await db.flush()

    for idx, t in enumerate(payload.tiers):
        if t.capacity_limit is not None and t.capacity_limit > payload.total_capacity:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Tier capacityLimit cannot exceed session totalCapacity",
            )
        db.add(
            TicketTier(
                id=new_id("tier"),
                session_id=ses.id,
                business_id=business.id,
                name=t.name.strip(),
                description=t.description.strip(),
                price=t.price,
                currency=t.currency.upper(),
                capacity_limit=t.capacity_limit,
                reserved_count=0,
                sort_order=t.sort_order or idx,
                active=t.active,
            )
        )

    await db.commit()
    loaded = (
        await db.execute(select(EventSession).options(selectinload(EventSession.tiers)).where(EventSession.id == ses.id))
    ).scalar_one()
    return serialize_session(loaded)


@router.patch("/businesses/{business_id}/sessions/{session_id}", response_model=EventSessionOut)
async def update_session(
    business_id: str,
    session_id: str,
    payload: EventSessionUpdateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "events.manage")
    ses = await db.get(EventSession, session_id)
    if not ses or ses.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    data = payload.model_dump(exclude_unset=True)
    new_start = data.get("start_at", ses.start_at)
    new_end = data.get("end_at", ses.end_at)
    if new_end <= new_start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="endAt must be after startAt")
    if "total_capacity" in data and data["total_capacity"] < ses.reserved_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot lower totalCapacity below already reserved count ({ses.reserved_count})",
        )
    for k, v in data.items():
        setattr(ses, k, v)
    await db.commit()
    loaded = (
        await db.execute(select(EventSession).options(selectinload(EventSession.tiers)).where(EventSession.id == ses.id))
    ).scalar_one()
    return serialize_session(loaded)


@router.get("/businesses/{business_id}/sessions/{session_id}", response_model=EventSessionOut)
async def get_session_details(
    business_id: str,
    session_id: str,
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, _ = await ensure_business_visible(db, business_id, user)
    ses = (
        await db.execute(
            select(EventSession)
            .options(selectinload(EventSession.tiers), selectinload(EventSession.offering))
            .where(EventSession.id == session_id, EventSession.business_id == business_id)
        )
    ).scalar_one_or_none()
    if not ses or not ses.offering:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if not ses.offering.active:
        can_view_inactive = False
        if user:
            if user.is_platform_admin or business.owner_user_id == user.id:
                can_view_inactive = True
            else:
                membership = await get_active_membership(db, user.id, business.id)
                can_view_inactive = bool(membership and has_permission(membership.role, "events.manage"))
        if not can_view_inactive:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return serialize_session(ses)


@router.post(
    "/businesses/{business_id}/sessions/{session_id}/tiers",
    response_model=TicketTierOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_session_tier(
    business_id: str,
    session_id: str,
    payload: TicketTierIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "events.manage")
    ses = await db.get(EventSession, session_id)
    if not ses or ses.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if payload.capacity_limit is not None and payload.capacity_limit > ses.total_capacity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Tier capacityLimit cannot exceed session totalCapacity",
        )
    tier = TicketTier(
        id=new_id("tier"),
        session_id=ses.id,
        business_id=business_id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        price=payload.price,
        currency=payload.currency.upper(),
        capacity_limit=payload.capacity_limit,
        reserved_count=0,
        sort_order=payload.sort_order,
        active=payload.active,
    )
    db.add(tier)
    await db.commit()
    await db.refresh(tier)
    return serialize_tier(tier)


@router.patch("/businesses/{business_id}/sessions/{session_id}/tiers/{tier_id}", response_model=TicketTierOut)
async def update_session_tier(
    business_id: str,
    session_id: str,
    tier_id: str,
    payload: TicketTierUpdateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "events.manage")
    ses = await db.get(EventSession, session_id)
    if not ses or ses.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    tier = await db.get(TicketTier, tier_id)
    if not tier or tier.session_id != ses.id or tier.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket tier not found")

    data = payload.model_dump(exclude_unset=True)
    if "capacity_limit" in data and data["capacity_limit"] is not None:
        cap = data["capacity_limit"]
        if cap < tier.reserved_count:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot lower tier capacityLimit below reserved count ({tier.reserved_count})",
            )
        if cap > ses.total_capacity:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Tier capacityLimit cannot exceed session totalCapacity",
            )
    for k, v in data.items():
        if isinstance(v, str):
            v = v.strip()
        setattr(tier, k, v)
    await db.commit()
    await db.refresh(tier)
    return serialize_tier(tier)


@router.get("/businesses/{business_id}/sessions/{session_id}/attendees", response_model=list[SessionAttendeeOut])
async def list_session_attendees(
    business_id: str,
    session_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "bookings.view")
    ses = await db.get(EventSession, session_id)
    if not ses or ses.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    rows = (
        await db.execute(
            select(TicketPass, Booking, User, TicketTier)
            .join(Booking, Booking.id == TicketPass.booking_id)
            .join(User, User.id == Booking.customer_id)
            .outerjoin(TicketTier, TicketTier.id == TicketPass.tier_id)
            .where(TicketPass.session_id == session_id, TicketPass.business_id == business_id)
            .order_by(Booking.created_at.desc(), TicketPass.id.asc())
        )
    ).all()

    return [
        SessionAttendeeOut(
            pass_id=p.id,
            booking_id=b.id,
            session_id=p.session_id,
            tier_id=p.tier_id,
            tier_name=t.name if t else None,
            customer_id=u.id,
            customer_name=f"{u.first_name} {u.last_name}".strip(),
            attendee_name=p.attendee_name,
            booking_status=b.status,
            payment_status=b.payment_status,
            pass_code=p.pass_code,
            pass_status=p.status,
            checked_in_at=p.checked_in_at,
            created_at=b.created_at,
        )
        for p, b, u, t in rows
    ]
