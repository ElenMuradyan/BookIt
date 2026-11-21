from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.rate_limit import auth_rate_limiter, client_ip_from_request
from app.models.booking import Appointment, AppointmentStatusHistory
from app.models.catalog import Service
from app.models.user import User
from app.schemas.booking import (
    AppointmentCheckIn,
    AppointmentCreateIn,
    AppointmentNotesIn,
    AppointmentOut,
    AppointmentRescheduleIn,
    AppointmentStatusHistoryOut,
    AppointmentStatusIn,
)
from app.services.booking_service import (
    check_in_appointment_by_qr,
    create_booking_transactional,
    reschedule_appointment_transactional,
    transition_appointment_status,
)
from app.services.rbac import get_active_membership, has_permission, require_business_permission

router = APIRouter(prefix="/bookings", tags=["bookings"])


def _serialize_appointment(appt: Appointment) -> AppointmentOut:
    return AppointmentOut(
        id=appt.id,
        booking_id=appt.booking_id,
        business_id=appt.business_id,
        service_id=appt.service_id,
        employee_id=appt.employee_id,
        customer_id=appt.customer_id,
        start=appt.start_at,
        end=appt.end_at,
        status=appt.status,
        price=float(appt.price),
        currency=appt.currency,
        payment_status=appt.payment_status,
        payment_method=appt.payment_method,
        confirmation_mode=appt.confirmation_mode,
        notes=appt.notes,
        check_in_code=appt.check_in_code,
        checked_in_at=appt.checked_in_at,
        created_at=appt.created_at,
    )


@router.get("", response_model=list[AppointmentOut])
async def list_my_bookings(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    business_id: str | None = Query(default=None, alias="businessId"),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    if business_id:
        await require_business_permission(db, user, business_id, "bookings.view")
        stmt = select(Appointment).where(Appointment.business_id == business_id)
    else:
        stmt = select(Appointment).where(Appointment.customer_id == user.id)

    if status_filter:
        stmt = stmt.where(Appointment.status == status_filter)
    stmt = stmt.order_by(Appointment.start_at.desc()).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_appointment(r) for r in rows]


@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: AppointmentCreateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    customer_id = user.id
    if payload.customer_id and payload.customer_id != user.id:
        service = await db.get(Service, payload.service_id)
        if not service:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
        await require_business_permission(db, user, service.business_id, "bookings.manage")
        customer_id = payload.customer_id

    appt = await create_booking_transactional(
        db,
        actor=user,
        customer_id=customer_id,
        service_id=payload.service_id,
        employee_id=payload.employee_id,
        date_str=payload.date,
        time_str=payload.time,
        payment_method=payload.payment_method,
        notes=payload.notes,
        idempotency_key=payload.idempotency_key,
        enforce_advance_window=True,
    )
    return _serialize_appointment(appt)


@router.get("/{appointment_id}", response_model=AppointmentOut)
async def get_booking(
    appointment_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    appt = await db.get(Appointment, appointment_id)
    if not appt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if appt.customer_id != user.id and not user.is_platform_admin:
        member = await get_active_membership(db, user.id, appt.business_id)
        if not member or not has_permission(member.role, "bookings.view"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view this booking")
    return _serialize_appointment(appt)


@router.get("/{appointment_id}/history", response_model=list[AppointmentStatusHistoryOut])
async def get_booking_history(
    appointment_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    appt = await db.get(Appointment, appointment_id)
    if not appt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if appt.customer_id != user.id and not user.is_platform_admin:
        await require_business_permission(db, user, appt.business_id, "bookings.view")
    rows = (
        await db.execute(
            select(AppointmentStatusHistory)
            .where(AppointmentStatusHistory.appointment_id == appointment_id)
            .order_by(AppointmentStatusHistory.changed_at.asc())
        )
    ).scalars().all()
    return [AppointmentStatusHistoryOut.model_validate(r) for r in rows]


@router.patch("/{appointment_id}/status", response_model=AppointmentOut)
async def update_booking_status(
    appointment_id: str,
    payload: AppointmentStatusIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    appt = await transition_appointment_status(
        db,
        appointment_id=appointment_id,
        target_status=payload.status,
        actor=user,
        reason=payload.reason,
    )
    return _serialize_appointment(appt)


@router.post("/{appointment_id}/reschedule", response_model=AppointmentOut)
async def reschedule_booking(
    appointment_id: str,
    payload: AppointmentRescheduleIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    appt = await reschedule_appointment_transactional(
        db,
        appointment_id=appointment_id,
        date_str=payload.date,
        time_str=payload.time,
        actor=user,
        enforce_advance_window=True,
    )
    return _serialize_appointment(appt)


@router.patch("/{appointment_id}/notes", response_model=AppointmentOut)
async def update_booking_notes(
    appointment_id: str,
    payload: AppointmentNotesIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    appt = await db.get(Appointment, appointment_id)
    if not appt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    await require_business_permission(db, user, appt.business_id, "bookings.manage")
    appt.notes = payload.notes.strip() or None
    await db.commit()
    await db.refresh(appt)
    return _serialize_appointment(appt)


@router.post("/businesses/{business_id}/check-in", response_model=AppointmentOut)
async def qr_check_in(
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
    appt = await check_in_appointment_by_qr(
        db,
        business_id=business_id,
        check_in_code=payload.check_in_code,
        actor=user,
    )
    return _serialize_appointment(appt)
