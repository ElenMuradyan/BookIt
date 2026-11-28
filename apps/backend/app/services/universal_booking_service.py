from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.base import utc_now
from app.models.booking import (
    Appointment,
    AppointmentStatusHistory,
    Booking,
    BookingStatusHistory,
    EventSession,
    ResourceAllocation,
    TicketPass,
    TicketTier,
)
from app.models.business import Business
from app.models.engagement import Notification
from app.models.user import User
from app.services.availability_service import get_zone_info
from app.services.booking_config_service import get_effective_booking_config
from app.services.booking_service import ALLOWED_STATUS_TRANSITIONS, create_booking_transactional
from app.services.event_service import reserve_session_transactional
from app.services.notification_service import (
    build_booking_lifecycle_email,
    send_user_transactional_email,
)
from app.services.rbac import get_active_membership, has_permission
from app.services.resource_service import reserve_resource_transactional

UNIVERSAL_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "held": {"pending", "confirmed", "cancelled", "expired"},
    "pending": {"confirmed", "rejected", "cancelled"},
    "confirmed": {"completed", "cancelled", "no_show"},
    "completed": set(),
    "cancelled": set(),
    "rejected": set(),
    "no_show": set(),
    "expired": set(),
}


async def load_universal_booking(db: AsyncSession, booking_id: str) -> Booking | None:
    return (
        await db.execute(
            select(Booking)
            .options(
                selectinload(Booking.resource_allocations),
                selectinload(Booking.ticket_passes),
            )
            .where(Booking.id == booking_id)
        )
    ).scalar_one_or_none()


async def create_universal_booking_transactional(
    db: AsyncSession,
    *,
    actor: User,
    customer_id: str,
    payload,
) -> Booking:
    model = payload.booking_model
    if model == "appointment":
        if not payload.service_id or not payload.employee_id or not payload.date or not payload.time:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Appointments require serviceId, employeeId, date, and time",
            )
        appt = await create_booking_transactional(
            db,
            actor=actor,
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
        bk = await load_universal_booking(db, appt.booking_id) if appt.booking_id else None
        if not bk:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Booking bridge missing")
        return bk

    if model == "resource":
        if not payload.resource_id or not payload.start_at or not payload.end_at:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Resource bookings require resourceId, startAt, and endAt",
            )
        bk = await reserve_resource_transactional(
            db,
            actor=actor,
            customer_id=customer_id,
            resource_id=payload.resource_id,
            start_at=payload.start_at,
            end_at=payload.end_at,
            quantity_units=payload.quantity_units,
            party_size=payload.party_size,
            payment_method=payload.payment_method,
            notes=payload.notes,
            idempotency_key=payload.idempotency_key,
            hold_only=payload.hold_only,
            enforce_advance_window=True,
        )
        return (await load_universal_booking(db, bk.id)) or bk

    if model in ("ticket", "capacity"):
        if not payload.session_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{model.capitalize()} bookings require sessionId",
            )
        if payload.tickets:
            lines = [
                {"tier_id": item.tier_id, "quantity": item.quantity, "attendee_names": item.attendee_names}
                for item in payload.tickets
            ]
        else:
            lines = [
                {
                    "tier_id": payload.tier_id,
                    "quantity": payload.quantity,
                    "attendee_names": payload.attendee_names,
                }
            ]
        bk = await reserve_session_transactional(
            db,
            actor=actor,
            customer_id=customer_id,
            booking_model=model,
            session_id=payload.session_id,
            lines=lines,
            payment_method=payload.payment_method,
            notes=payload.notes,
            idempotency_key=payload.idempotency_key,
            hold_only=payload.hold_only,
        )
        return (await load_universal_booking(db, bk.id)) or bk

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported booking model")


async def transition_universal_booking_status(
    db: AsyncSession,
    *,
    booking_id: str,
    target_status: str,
    actor: User,
    reason: str | None = None,
) -> Booking:
    booking = (
        await db.execute(
            select(Booking)
            .options(
                selectinload(Booking.resource_allocations),
                selectinload(Booking.ticket_passes),
            )
            .where(Booking.id == booking_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    is_customer = booking.customer_id == actor.id
    membership = await get_active_membership(db, actor.id, booking.business_id)
    business = await db.get(Business, booking.business_id)
    is_staff = bool(
        actor.is_platform_admin
        or (business and business.owner_user_id == actor.id)
        or (membership and has_permission(membership.role, "bookings.manage"))
    )

    if not is_customer and not is_staff:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot modify this booking")
    if is_customer and not is_staff and target_status != "cancelled":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customers may only cancel their own bookings")

    if booking.status == target_status:
        return booking

    allowed = UNIVERSAL_STATUS_TRANSITIONS.get(booking.status, set())
    if target_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot transition booking from {booking.status} to {target_status}",
        )

    old_status = booking.status
    now = utc_now()
    if target_status in ("cancelled", "rejected", "expired"):
        # Compute cancellation refund eligibility using snapshotted cutoff + policy
        if is_customer and not is_staff and booking.amount_paid > 0 and business:
            policy = await get_effective_booking_config(db, business=business, booking_model=booking.booking_model)
            paid = float(booking.amount_paid)
            if booking.cancellation_cutoff_at and now > booking.cancellation_cutoff_at:
                fee = round(paid * (policy.cancellation_fee_percent / 100.0), 2)
                booking.refunded_amount = round(max(0.0, paid - fee), 2)
            else:
                booking.refunded_amount = paid
            if booking.refunded_amount >= paid and paid > 0:
                booking.payment_status = "refunded"
            elif booking.refunded_amount > 0:
                booking.payment_status = "partially_refunded"

        # Release resource allocations
        for alloc in booking.resource_allocations:
            alloc.status = "expired" if target_status == "expired" else "cancelled"

        # Release session + tier capacity atomically for valid passes
        session_releases: dict[str, int] = {}
        tier_releases: dict[str, int] = {}
        for p in booking.ticket_passes:
            if p.status == "valid":
                p.status = "expired" if target_status == "expired" else ("refunded" if booking.payment_status == "refunded" else "cancelled")
                session_releases[p.session_id] = session_releases.get(p.session_id, 0) + 1
                if p.tier_id:
                    tier_releases[p.tier_id] = tier_releases.get(p.tier_id, 0) + 1

        for sid, cnt in session_releases.items():
            await db.execute(
                update(EventSession)
                .where(EventSession.id == sid)
                .values(
                    reserved_count=func.greatest(0, EventSession.reserved_count - cnt),
                    status="on_sale",
                )
            )
        for tid, cnt in tier_releases.items():
            await db.execute(
                update(TicketTier)
                .where(TicketTier.id == tid)
                .values(reserved_count=func.greatest(0, TicketTier.reserved_count - cnt))
            )
    else:
        for alloc in booking.resource_allocations:
            if alloc.status in ("held", "pending", "confirmed"):
                alloc.status = target_status

    booking.status = target_status
    db.add(
        BookingStatusHistory(
            booking_id=booking.id,
            from_status=old_status,
            to_status=target_status,
            changed_by_user_id=actor.id,
            reason=reason,
        )
    )

    # Keep linked legacy Appointment synchronized without deleting it
    if booking.booking_model == "appointment":
        appt = (
            await db.execute(select(Appointment).where(Appointment.booking_id == booking.id).with_for_update())
        ).scalar_one_or_none()
        if appt and target_status in ALLOWED_STATUS_TRANSITIONS.get(appt.status, set()):
            prev_appt_status = appt.status
            appt.status = target_status
            if booking.payment_status in ("paid", "refunded"):
                appt.payment_status = booking.payment_status
            db.add(
                AppointmentStatusHistory(
                    appointment_id=appt.id,
                    from_status=prev_appt_status,
                    to_status=target_status,
                    changed_by_user_id=actor.id,
                    reason=reason,
                )
            )

    if business:
        if is_customer and not is_staff and target_status == "cancelled":
            db.add(
                Notification(
                    user_id=business.owner_user_id,
                    business_id=business.id,
                    category="booking",
                    title="Booking cancelled by customer",
                    body=f"{booking.title_snapshot} was cancelled.",
                    href="/workspace/bookings",
                )
            )
        elif target_status in ("confirmed", "cancelled", "rejected"):
            db.add(
                Notification(
                    user_id=booking.customer_id,
                    business_id=business.id,
                    category="booking",
                    title=f"Booking {target_status.replace('_', ' ')}",
                    body=f"{booking.title_snapshot} at {business.name} is now {target_status.replace('_', ' ')}.",
                    href=f"/bookings/{booking.id}",
                )
            )

    await db.commit()
    if business and target_status in ("confirmed", "cancelled", "rejected"):
        recipient_user_id = business.owner_user_id if (is_customer and not is_staff) else booking.customer_id
        recipient_user = await db.get(User, recipient_user_id)
        if recipient_user:
            when_label = (
                booking.start_at.astimezone(get_zone_info(booking.timezone)).strftime("%Y-%m-%d %H:%M %Z")
                if booking.start_at
                else "Scheduled booking"
            )
            subject, body, html_body = build_booking_lifecycle_email(
                event_kind=target_status,
                recipient_name=recipient_user.first_name or recipient_user.email,
                business_name=business.name,
                title=booking.title_snapshot,
                when_label=when_label,
                status_label=target_status.replace("_", " "),
                check_in_code=booking.check_in_code if target_status == "confirmed" else None,
                reason=reason,
            )
            await send_user_transactional_email(
                db,
                user_id=recipient_user_id,
                category="booking",
                subject=subject,
                body=body,
                html_body=html_body,
                idempotency_key=f"bk-status-{booking.id}-{target_status}",
            )
    return (await load_universal_booking(db, booking.id)) or booking


async def send_universal_booking_reminder(
    db: AsyncSession,
    *,
    booking_id: str,
    actor: User,
    message: str | None = None,
) -> tuple[Booking, bool, str]:
    booking = await load_universal_booking(db, booking_id)
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    business = await db.get(Business, booking.business_id)
    membership = await get_active_membership(db, actor.id, booking.business_id)
    is_staff = bool(
        actor.is_platform_admin
        or (business and business.owner_user_id == actor.id)
        or (membership and has_permission(membership.role, "bookings.manage"))
    )
    if not is_staff:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff permission required to send reminders")
    if booking.status not in ("pending", "confirmed"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot send a reminder for a {booking.status} booking",
        )

    business_name = business.name if business else "BookIt Business"
    when_label = (
        booking.start_at.astimezone(get_zone_info(booking.timezone)).strftime("%Y-%m-%d %H:%M %Z")
        if booking.start_at
        else "Upcoming booking"
    )
    custom_note = message.strip() if message and message.strip() else None
    db.add(
        Notification(
            user_id=booking.customer_id,
            business_id=booking.business_id,
            category="reminder",
            title=f"Reminder: {booking.title_snapshot}",
            body=custom_note or f"{business_name} · {when_label}",
            href=f"/bookings/{booking.id}",
        )
    )
    await db.commit()

    customer_user = await db.get(User, booking.customer_id)
    if not customer_user:
        return booking, False, "recipient_missing"

    subject, body, html_body = build_booking_lifecycle_email(
        event_kind="reminder",
        recipient_name=customer_user.first_name or customer_user.email,
        business_name=business_name,
        title=booking.title_snapshot,
        when_label=when_label,
        status_label=booking.status,
        check_in_code=booking.check_in_code,
        reason=custom_note,
    )
    delivered, delivery_status = await send_user_transactional_email(
        db,
        user_id=booking.customer_id,
        category="reminder",
        subject=subject,
        body=body,
        html_body=html_body,
    )
    return booking, delivered, delivery_status


async def check_in_universal_qr(
    db: AsyncSession,
    *,
    business_id: str,
    code: str,
    actor: User,
) -> dict:
    cleaned = code.strip().upper()
    now = utc_now()

    membership = await get_active_membership(db, actor.id, business_id)
    business = await db.get(Business, business_id)
    is_staff = bool(
        actor.is_platform_admin
        or (business and business.owner_user_id == actor.id)
        or (membership and has_permission(membership.role, "bookings.manage"))
    )

    # 1. Check individual ticket pass code (TKT-...)
    ticket_pass = (
        await db.execute(
            select(TicketPass)
            .where(TicketPass.business_id == business_id, TicketPass.pass_code == cleaned)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if ticket_pass:
        booking = await db.get(Booking, ticket_pass.booking_id)
        if not booking:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent booking not found")
        if not is_staff and booking.customer_id != actor.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to check in this pass")
        if ticket_pass.status == "checked_in":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This ticket pass has already checked in")
        if ticket_pass.status != "valid":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Cannot check in a {ticket_pass.status} pass")
        if booking.status not in ("confirmed", "pending"):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Booking is {booking.status}")

        ticket_pass.status = "checked_in"
        ticket_pass.checked_in_at = now
        ticket_pass.checked_in_by_user_id = actor.id
        if booking.checked_in_at is None:
            booking.checked_in_at = now
        await db.commit()
        return {
            "kind": "ticket_pass",
            "booking_id": booking.id,
            "business_id": business_id,
            "code": ticket_pass.pass_code,
            "status": ticket_pass.status,
            "checked_in_at": now,
            "title": booking.title_snapshot,
            "customer_id": booking.customer_id,
            "legacy_appointment_id": None,
            "ticket_pass_id": ticket_pass.id,
        }

    # 2. Check legacy appointment code or universal Booking check_in_code (BK-...)
    appt = (
        await db.execute(
            select(Appointment)
            .where(Appointment.business_id == business_id, Appointment.check_in_code == cleaned)
            .with_for_update()
        )
    ).scalar_one_or_none()
    booking = (
        await db.execute(
            select(Booking)
            .where(Booking.business_id == business_id, Booking.check_in_code == cleaned)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if not booking and not appt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid QR check-in code for this business")

    owner_customer_id = booking.customer_id if booking else appt.customer_id  # type: ignore[union-attr]
    if not is_staff and owner_customer_id != actor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to check in this booking")

    current_status = booking.status if booking else appt.status  # type: ignore[union-attr]
    if current_status not in ("confirmed", "pending"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Cannot check in a {current_status} booking")
    if current_status == "pending" and not is_staff:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This booking is still pending business confirmation")

    if booking:
        if booking.checked_in_at is None:
            booking.checked_in_at = now
        if booking.status == "pending" and is_staff:
            booking.status = "confirmed"
            db.add(
                BookingStatusHistory(
                    booking_id=booking.id,
                    from_status="pending",
                    to_status="confirmed",
                    changed_by_user_id=actor.id,
                    reason="Confirmed via QR check-in",
                )
            )
    if appt:
        if appt.checked_in_at is None:
            appt.checked_in_at = now
        if appt.status == "pending" and is_staff:
            appt.status = "confirmed"
            db.add(
                AppointmentStatusHistory(
                    appointment_id=appt.id,
                    from_status="pending",
                    to_status="confirmed",
                    changed_by_user_id=actor.id,
                    reason="Confirmed via QR front-desk check-in",
                )
            )

    await db.commit()
    return {
        "kind": "appointment" if appt else "booking",
        "booking_id": booking.id if booking else appt.id,  # type: ignore[union-attr]
        "business_id": business_id,
        "code": cleaned,
        "status": "confirmed" if (current_status == "pending" and is_staff) else current_status,
        "checked_in_at": now,
        "title": booking.title_snapshot if booking else "Appointment",
        "customer_id": owner_customer_id,
        "legacy_appointment_id": appt.id if appt else None,
        "ticket_pass_id": None,
    }
