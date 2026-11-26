import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.base import new_id, utc_now
from app.models.booking import Appointment, AppointmentStatusHistory, Booking, BookingStatusHistory
from app.models.business import Business, Membership
from app.models.catalog import Employee, Service
from app.models.engagement import Notification
from app.models.user import User
from app.services.availability_service import (
    ACTIVE_BOOKING_STATUSES,
    compute_available_slots,
    get_zone_info,
)
from app.services.booking_config_service import (
    compute_cancellation_cutoff,
    compute_deposit_amount,
    get_effective_booking_config,
)
from app.services.rbac import get_active_membership, has_permission

ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"confirmed", "rejected", "cancelled"},
    "confirmed": {"completed", "cancelled", "no_show"},
    "completed": set(),
    "cancelled": set(),
    "rejected": set(),
    "no_show": set(),
}


async def load_availability_for_service(
    db: AsyncSession,
    *,
    business: Business,
    service: Service,
    date_str: str,
    employee_id: str | None = None,
    now_utc: datetime | None = None,
    enforce_advance_window: bool = True,
    exclude_appointment_id: str | None = None,
):
    stmt = (
        select(Employee)
        .options(selectinload(Employee.services))
        .where(Employee.business_id == business.id)
    )
    employees = list((await db.execute(stmt)).scalars().all())
    eligible_emp_dicts = []
    for emp in employees:
        svc_ids = [s.id for s in emp.services]
        if service.id in svc_ids:
            eligible_emp_dicts.append(
                {
                    "id": emp.id,
                    "status": emp.status,
                    "hours": emp.hours,
                    "service_ids": svc_ids,
                }
            )

    tz = get_zone_info(business.timezone)
    target_d = datetime.strptime(date_str, "%Y-%m-%d").date()
    day_start_utc = datetime.combine(target_d, datetime.min.time(), tzinfo=tz).astimezone(UTC) - timedelta(days=1)
    day_end_utc = day_start_utc + timedelta(days=3)

    appt_stmt = select(
        Appointment.employee_id,
        Appointment.start_at,
        Appointment.end_at,
        Appointment.status,
    ).where(
        Appointment.business_id == business.id,
        Appointment.status.in_(ACTIVE_BOOKING_STATUSES),
        Appointment.end_at > day_start_utc,
        Appointment.start_at < day_end_utc,
    )
    if exclude_appointment_id:
        appt_stmt = appt_stmt.where(Appointment.id != exclude_appointment_id)
    existing = list((await db.execute(appt_stmt)).all())

    return compute_available_slots(
        target_date_str=date_str,
        tz_name=business.timezone,
        duration_minutes=service.duration_minutes,
        business_hours=business.hours,
        holidays=business.holidays or [],
        blocked=business.blocked or [],
        employees=eligible_emp_dicts,
        existing_appointments=[(r[0], r[1], r[2], r[3]) for r in existing],
        min_notice_minutes=business.min_notice_minutes,
        max_advance_days=business.max_advance_days,
        now_utc=now_utc,
        employee_id_filter=employee_id,
        enforce_advance_window=enforce_advance_window,
    )


async def create_booking_transactional(
    db: AsyncSession,
    *,
    actor: User,
    customer_id: str,
    service_id: str,
    employee_id: str,
    date_str: str,
    time_str: str,
    payment_method: str,
    notes: str | None = None,
    idempotency_key: str | None = None,
    now_utc: datetime | None = None,
    enforce_advance_window: bool = True,
) -> Appointment:
    if idempotency_key:
        existing_idem = (
            await db.execute(select(Appointment).where(Appointment.idempotency_key == idempotency_key))
        ).scalar_one_or_none()
        if existing_idem:
            if existing_idem.customer_id != customer_id and not actor.is_platform_admin:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Idempotency key belongs to another user")
            return existing_idem

    service = (
        await db.execute(
            select(Service).options(selectinload(Service.employees)).where(Service.id == service_id, Service.active.is_(True))
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service unavailable")

    business = await db.get(Business, service.business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    if not business.is_public or business.status != "approved":
        membership = await get_active_membership(db, actor.id, business.id)
        if not actor.is_platform_admin and business.owner_user_id != actor.id and not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This business is not open for booking")

    # Lock the employee row inside the DB transaction to serialize concurrent slot reservations
    employee = (
        await db.execute(
            select(Employee)
            .where(Employee.id == employee_id, Employee.business_id == business.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Choose a valid team member")

    if idempotency_key:
        existing_idem = (
            await db.execute(select(Appointment).where(Appointment.idempotency_key == idempotency_key))
        ).scalar_one_or_none()
        if existing_idem:
            if existing_idem.customer_id != customer_id and not actor.is_platform_admin:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Idempotency key belongs to another user")
            return existing_idem

    if not any(e.id == employee.id for e in service.employees):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected staff member does not offer this service")

    # Re-verify availability inside locked transaction
    slots = await load_availability_for_service(
        db,
        business=business,
        service=service,
        date_str=date_str,
        employee_id=employee.id,
        now_utc=now_utc,
        enforce_advance_window=enforce_advance_window,
    )
    chosen = next((s for s in slots if s.time_label == time_str), None)
    if not chosen:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This time slot is no longer available",
        )

    policy = await get_effective_booking_config(db, business=business, booking_model="appointment")
    booking_status = "pending" if (service.requires_approval or policy.approval_mode == "manual") else "confirmed"
    confirmation_mode = "manual" if booking_status == "pending" else "automatic"
    appt_id = new_id("apt")
    booking_id = new_id("bk")
    check_in_code = f"BK-{secrets.token_hex(3).upper()}"
    total_price = float(service.price)
    deposit_due = compute_deposit_amount(
        total_amount=total_price,
        policy=policy,
        override_deposit=float(service.deposit_amount) if service.deposit_amount is not None else None,
    )
    is_paid = False

    booking = Booking(
        id=booking_id,
        business_id=business.id,
        customer_id=customer_id,
        booking_model="appointment",
        title_snapshot=service.name,
        start_at=chosen.start_at,
        end_at=chosen.end_at,
        timezone=business.timezone,
        quantity=1,
        status=booking_status,
        confirmation_mode=confirmation_mode,
        subtotal_amount=total_price,
        discount_amount=0,
        tax_amount=0,
        total_amount=total_price,
        deposit_due_amount=deposit_due,
        amount_paid=total_price if is_paid else 0,
        refunded_amount=0,
        currency=service.currency,
        payment_status="paid" if is_paid else "unpaid",
        payment_method=payment_method,
        cancellation_cutoff_at=compute_cancellation_cutoff(chosen.start_at, policy),
        cancellation_policy_snapshot=service.cancellation_policy or policy.cancellation_policy_text,
        notes=notes.strip() if notes and notes.strip() else None,
        metadata_json={
            "legacyAppointmentId": appt_id,
            "serviceId": service.id,
            "employeeId": employee.id,
        },
        idempotency_key=idempotency_key,
        check_in_code=check_in_code,
    )
    appointment = Appointment(
        id=appt_id,
        booking_id=booking_id,
        business_id=business.id,
        service_id=service.id,
        employee_id=employee.id,
        customer_id=customer_id,
        start_at=chosen.start_at,
        end_at=chosen.end_at,
        status=booking_status,
        price=total_price,
        currency=service.currency,
        payment_status="paid" if is_paid else "unpaid",
        payment_method=payment_method,
        confirmation_mode=confirmation_mode,
        notes=notes.strip() if notes and notes.strip() else None,
        idempotency_key=idempotency_key,
        check_in_code=check_in_code,
    )
    db.add(booking)
    await db.flush()
    db.add(
        BookingStatusHistory(
            booking_id=booking_id,
            from_status=None,
            to_status=booking_status,
            changed_by_user_id=actor.id,
            reason="Initial booking creation",
        )
    )
    db.add(appointment)
    db.add(
        AppointmentStatusHistory(
            appointment_id=appointment.id,
            from_status=None,
            to_status=booking_status,
            changed_by_user_id=actor.id,
            reason="Initial booking creation",
        )
    )

    # Persistent notifications
    db.add(
        Notification(
            user_id=customer_id,
            business_id=business.id,
            category="booking",
            title="Request sent" if booking_status == "pending" else "Booking confirmed",
            body=f"{service.name} · {date_str} {time_str}",
            href=f"/bookings/{appointment.id}",
        )
    )
    if business.owner_user_id != customer_id:
        customer = await db.get(User, customer_id)
        customer_name = f"{customer.first_name} {customer.last_name}" if customer else "Customer"
        db.add(
            Notification(
                user_id=business.owner_user_id,
                business_id=business.id,
                category="booking",
                title="New booking request" if booking_status == "pending" else "New booking confirmed",
                body=f"{customer_name} booked {service.name} for {date_str} at {time_str}.",
                href="/workspace/bookings",
            )
        )

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if idempotency_key:
            existing_idem = (
                await db.execute(select(Appointment).where(Appointment.idempotency_key == idempotency_key))
            ).scalar_one_or_none()
            if existing_idem:
                if existing_idem.customer_id != customer_id and not actor.is_platform_admin:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Idempotency key belongs to another user",
                    ) from exc
                return existing_idem
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Time slot already reserved by a concurrent booking",
        ) from exc

    await db.refresh(appointment)
    return appointment


async def transition_appointment_status(
    db: AsyncSession,
    *,
    appointment_id: str,
    target_status: str,
    actor: User,
    reason: str | None = None,
) -> Appointment:
    appointment = (
        await db.execute(
            select(Appointment).where(Appointment.id == appointment_id).with_for_update()
        )
    ).scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    is_customer = appointment.customer_id == actor.id
    membership: Membership | None = await get_active_membership(db, actor.id, appointment.business_id)
    business = await db.get(Business, appointment.business_id)
    is_staff = bool(
        actor.is_platform_admin
        or (business and business.owner_user_id == actor.id)
        or (membership and has_permission(membership.role, "bookings.manage"))
    )

    if not is_customer and not is_staff:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot modify this booking")

    if is_customer and not is_staff and target_status != "cancelled":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customers may only cancel their own bookings")

    if appointment.status == target_status:
        return appointment

    allowed_next = ALLOWED_STATUS_TRANSITIONS.get(appointment.status, set())
    if target_status not in allowed_next:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot transition booking from {appointment.status} to {target_status}",
        )

    old_status = appointment.status
    appointment.status = target_status
    db.add(
        AppointmentStatusHistory(
            appointment_id=appointment.id,
            from_status=old_status,
            to_status=target_status,
            changed_by_user_id=actor.id,
            reason=reason,
        )
    )
    if appointment.booking_id:
        linked_bk = await db.get(Booking, appointment.booking_id)
        if linked_bk:
            linked_bk.status = target_status
            db.add(
                BookingStatusHistory(
                    booking_id=linked_bk.id,
                    from_status=old_status,
                    to_status=target_status,
                    changed_by_user_id=actor.id,
                    reason=reason,
                )
            )

    service = await db.get(Service, appointment.service_id)
    if is_customer and not is_staff and business:
        db.add(
            Notification(
                user_id=business.owner_user_id,
                business_id=business.id,
                category="booking",
                title="Booking cancelled by customer",
                body=f"{service.name if service else 'Appointment'} was cancelled.",
                href="/workspace/bookings",
            )
        )
    elif business:
        db.add(
            Notification(
                user_id=appointment.customer_id,
                business_id=business.id,
                category="booking",
                title=f"Booking {target_status.replace('_', ' ')}",
                body=f"{service.name if service else 'Your appointment'} at {business.name} is now {target_status.replace('_', ' ')}.",
                href=f"/bookings/{appointment.id}",
            )
        )

    await db.commit()
    await db.refresh(appointment)
    return appointment


async def reschedule_appointment_transactional(
    db: AsyncSession,
    *,
    appointment_id: str,
    date_str: str,
    time_str: str,
    actor: User,
    now_utc: datetime | None = None,
    enforce_advance_window: bool = True,
) -> Appointment:
    appointment = (
        await db.execute(
            select(Appointment).where(Appointment.id == appointment_id).with_for_update()
        )
    ).scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    if appointment.status not in ACTIVE_BOOKING_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only pending or confirmed bookings can be rescheduled")

    is_customer = appointment.customer_id == actor.id
    membership = await get_active_membership(db, actor.id, appointment.business_id)
    business = await db.get(Business, appointment.business_id)
    is_staff = bool(
        actor.is_platform_admin
        or (business and business.owner_user_id == actor.id)
        or (membership and has_permission(membership.role, "bookings.manage"))
    )
    if not is_customer and not is_staff:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot reschedule this booking")

    service = await db.get(Service, appointment.service_id)
    if not service or not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service or business missing")

    # Lock employee row
    await db.execute(select(Employee).where(Employee.id == appointment.employee_id).with_for_update())

    slots = await load_availability_for_service(
        db,
        business=business,
        service=service,
        date_str=date_str,
        employee_id=appointment.employee_id,
        now_utc=now_utc,
        enforce_advance_window=enforce_advance_window,
        exclude_appointment_id=appointment.id,
    )
    chosen = next((s for s in slots if s.time_label == time_str), None)
    if not chosen:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Selected reschedule slot is unavailable")

    old_status = appointment.status
    new_status = "pending" if appointment.confirmation_mode == "manual" else "confirmed"
    appointment.start_at = chosen.start_at
    appointment.end_at = chosen.end_at
    appointment.status = new_status
    db.add(
        AppointmentStatusHistory(
            appointment_id=appointment.id,
            from_status=old_status,
            to_status=new_status,
            changed_by_user_id=actor.id,
            reason=f"Rescheduled to {date_str} {time_str}",
        )
    )
    if appointment.booking_id:
        linked_bk = await db.get(Booking, appointment.booking_id)
        if linked_bk:
            linked_bk.start_at = chosen.start_at
            linked_bk.end_at = chosen.end_at
            linked_bk.status = new_status
            db.add(
                BookingStatusHistory(
                    booking_id=linked_bk.id,
                    from_status=old_status,
                    to_status=new_status,
                    changed_by_user_id=actor.id,
                    reason=f"Rescheduled to {date_str} {time_str}",
                )
            )
    recipient_id = business.owner_user_id if (is_customer and not is_staff) else appointment.customer_id
    db.add(
        Notification(
            user_id=recipient_id,
            business_id=business.id,
            category="booking",
            title="Booking rescheduled",
            body=f"{service.name} moved to {date_str} at {time_str}.",
            href="/workspace/bookings" if (is_customer and not is_staff) else f"/bookings/{appointment.id}",
        )
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Reschedule time conflicts with another booking") from exc

    await db.refresh(appointment)
    return appointment


async def check_in_appointment_by_qr(
    db: AsyncSession,
    *,
    business_id: str,
    check_in_code: str,
    actor: User,
) -> Appointment:
    stmt = (
        select(Appointment)
        .where(
            Appointment.business_id == business_id,
            Appointment.check_in_code == check_in_code.strip().upper(),
        )
        .with_for_update()
    )
    appointment = (await db.execute(stmt)).scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid QR check-in code for this business")

    is_customer = appointment.customer_id == actor.id
    membership = await get_active_membership(db, actor.id, business_id)
    business = await db.get(Business, business_id)
    is_staff = bool(
        actor.is_platform_admin
        or (business and business.owner_user_id == actor.id)
        or (membership and has_permission(membership.role, "bookings.manage"))
    )
    if not is_customer and not is_staff:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to check in this appointment")

    if appointment.status not in ("confirmed", "pending"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Cannot check in a {appointment.status} booking")

    if appointment.status == "pending" and not is_staff:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This booking is still pending business confirmation",
        )

    if appointment.checked_in_at is None:
        appointment.checked_in_at = utc_now()
    if appointment.status == "pending" and is_staff:
        appointment.status = "confirmed"
        db.add(
            AppointmentStatusHistory(
                appointment_id=appointment.id,
                from_status="pending",
                to_status="confirmed",
                changed_by_user_id=actor.id,
                reason="Confirmed via QR front-desk check-in",
            )
        )
    if appointment.booking_id:
        linked_bk = await db.get(Booking, appointment.booking_id)
        if linked_bk:
            if linked_bk.checked_in_at is None:
                linked_bk.checked_in_at = appointment.checked_in_at
            if appointment.status == "confirmed" and linked_bk.status == "pending":
                linked_bk.status = "confirmed"
                db.add(
                    BookingStatusHistory(
                        booking_id=linked_bk.id,
                        from_status="pending",
                        to_status="confirmed",
                        changed_by_user_id=actor.id,
                        reason="Confirmed via QR front-desk check-in",
                    )
                )
    await db.commit()
    await db.refresh(appointment)
    return appointment
