from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies.auth import require_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.rate_limit import auth_rate_limiter, client_ip_from_request
from app.models.booking import Appointment, Booking, BookingStatusHistory
from app.models.user import User
from app.schemas.booking import (
    AppointmentCheckIn,
    ResourceAllocationOut,
    TicketPassOut,
    UniversalBookingCreateIn,
    UniversalBookingOut,
    UniversalBookingStatusHistoryOut,
    UniversalBookingStatusIn,
    UniversalCheckInOut,
    UniversalReminderIn,
    UniversalReminderOut,
)
from app.services.rbac import require_business_permission
from app.services.universal_booking_service import (
    check_in_universal_qr,
    create_universal_booking_transactional,
    load_universal_booking,
    send_universal_booking_reminder,
    transition_universal_booking_status,
)

router = APIRouter(prefix="/bookings/universal", tags=["universal-bookings"])


def serialize_universal_booking(bk: Booking, legacy_appointment_id: str | None = None) -> UniversalBookingOut:
    meta = bk.metadata_json or {}
    legacy_id = legacy_appointment_id or meta.get("legacyAppointmentId")
    return UniversalBookingOut(
        id=bk.id,
        business_id=bk.business_id,
        customer_id=bk.customer_id,
        booking_model=bk.booking_model,  # type: ignore[arg-type]
        title=bk.title_snapshot,
        start_at=bk.start_at,
        end_at=bk.end_at,
        timezone=bk.timezone,
        quantity=bk.quantity,
        status=bk.status,
        confirmation_mode=bk.confirmation_mode,
        subtotal_amount=float(bk.subtotal_amount),
        discount_amount=float(bk.discount_amount),
        tax_amount=float(bk.tax_amount),
        total_amount=float(bk.total_amount),
        deposit_due_amount=float(bk.deposit_due_amount),
        amount_paid=float(bk.amount_paid),
        refunded_amount=float(bk.refunded_amount),
        currency=bk.currency,
        payment_status=bk.payment_status,
        payment_method=bk.payment_method,
        cancellation_cutoff_at=bk.cancellation_cutoff_at,
        cancellation_policy_snapshot=bk.cancellation_policy_snapshot,
        notes=bk.notes,
        metadata_json=meta,
        hold_expires_at=bk.hold_expires_at,
        check_in_code=bk.check_in_code,
        checked_in_at=bk.checked_in_at,
        created_at=bk.created_at,
        updated_at=bk.updated_at,
        legacy_appointment_id=legacy_id,
        resource_allocations=[
            ResourceAllocationOut(
                id=a.id,
                resource_id=a.resource_id,
                start_at=a.start_at,
                end_at=a.end_at,
                quantity_units=a.quantity_units,
                party_size=a.party_size,
                status=a.status,
                unit_price=float(a.unit_price),
            )
            for a in (bk.resource_allocations or [])
        ],
        ticket_passes=[
            TicketPassOut(
                id=p.id,
                booking_id=p.booking_id,
                business_id=p.business_id,
                session_id=p.session_id,
                tier_id=p.tier_id,
                attendee_name=p.attendee_name,
                attendee_email=p.attendee_email,
                seat_label=p.seat_label,
                unit_price=float(p.unit_price),
                pass_code=p.pass_code,
                status=p.status,
                checked_in_at=p.checked_in_at,
            )
            for p in (bk.ticket_passes or [])
        ],
    )


@router.get("", response_model=list[UniversalBookingOut])
async def list_universal_bookings(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    business_id: str | None = Query(default=None, alias="businessId"),
    booking_model: str | None = Query(default=None, alias="bookingModel"),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(Booking).options(
        selectinload(Booking.resource_allocations),
        selectinload(Booking.ticket_passes),
    )
    if business_id:
        await require_business_permission(db, user, business_id, "bookings.view")
        stmt = stmt.where(Booking.business_id == business_id)
    else:
        stmt = stmt.where(Booking.customer_id == user.id)

    if booking_model:
        stmt = stmt.where(Booking.booking_model == booking_model)
    if status_filter:
        stmt = stmt.where(Booking.status == status_filter)

    stmt = stmt.order_by(Booking.created_at.desc()).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [serialize_universal_booking(r) for r in rows]


@router.post("", response_model=UniversalBookingOut, status_code=status.HTTP_201_CREATED)
async def create_universal_booking(
    payload: UniversalBookingCreateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    customer_id = user.id
    if payload.customer_id and payload.customer_id != user.id:
        if not payload.business_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="businessId is required when staff creates a booking for a customer",
            )
        await require_business_permission(db, user, payload.business_id, "bookings.manage")
        customer_id = payload.customer_id

    bk = await create_universal_booking_transactional(db, actor=user, customer_id=customer_id, payload=payload)
    legacy = (
        await db.execute(select(Appointment.id).where(Appointment.booking_id == bk.id))
    ).scalar_one_or_none()
    return serialize_universal_booking(bk, legacy_appointment_id=legacy)


@router.get("/{booking_id}", response_model=UniversalBookingOut)
async def get_universal_booking(
    booking_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    bk = await load_universal_booking(db, booking_id)
    if not bk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if bk.customer_id != user.id and not user.is_platform_admin:
        await require_business_permission(db, user, bk.business_id, "bookings.view")
    return serialize_universal_booking(bk)


@router.get("/{booking_id}/history", response_model=list[UniversalBookingStatusHistoryOut])
async def get_universal_booking_history(
    booking_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    bk = await db.get(Booking, booking_id)
    if not bk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if bk.customer_id != user.id and not user.is_platform_admin:
        await require_business_permission(db, user, bk.business_id, "bookings.view")
    rows = (
        await db.execute(
            select(BookingStatusHistory)
            .where(BookingStatusHistory.booking_id == booking_id)
            .order_by(BookingStatusHistory.changed_at.asc())
        )
    ).scalars().all()
    return [UniversalBookingStatusHistoryOut.model_validate(r) for r in rows]


@router.patch("/{booking_id}/status", response_model=UniversalBookingOut)
async def update_universal_booking_status(
    booking_id: str,
    payload: UniversalBookingStatusIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    bk = await transition_universal_booking_status(
        db,
        booking_id=booking_id,
        target_status=payload.status,
        actor=user,
        reason=payload.reason,
    )
    return serialize_universal_booking(bk)


@router.post("/businesses/{business_id}/check-in", response_model=UniversalCheckInOut)
async def qr_check_in_universal(
    business_id: str,
    payload: AppointmentCheckIn,
    request: Request,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    settings = get_settings()
    ip = client_ip_from_request(request)
    await auth_rate_limiter.check(
        f"checkin:{user.id}:{business_id}:{ip}",
        settings.auth_rate_limit_max_attempts,
        settings.auth_rate_limit_window_seconds,
    )
    res = await check_in_universal_qr(
        db,
        business_id=business_id,
        code=payload.check_in_code,
        actor=user,
    )
    return UniversalCheckInOut(**res)


@router.post("/{booking_id}/remind", response_model=UniversalReminderOut)
async def remind_universal_booking(
    booking_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    payload: UniversalReminderIn | None = None,
):
    booking, delivered, delivery_status = await send_universal_booking_reminder(
        db,
        booking_id=booking_id,
        actor=user,
        message=payload.message if payload else None,
    )
    return UniversalReminderOut(
        ok=True,
        booking_id=booking.id,
        delivered=delivered,
        delivery_status=delivery_status,
    )
