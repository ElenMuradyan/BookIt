import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.base import new_id, utc_now
from app.models.booking import (
    Booking,
    BookingStatusHistory,
    EventOffering,
    EventSession,
    TicketPass,
    TicketTier,
)
from app.models.business import Business
from app.models.engagement import Notification
from app.models.user import User
from app.services.booking_config_service import (
    compute_cancellation_cutoff,
    compute_deposit_amount,
    get_effective_booking_config,
)
from app.services.rbac import get_active_membership


async def expire_stale_session_holds(db: AsyncSession, *, session_id: str, now_utc: datetime) -> None:
    held_bookings = list(
        (
            await db.execute(
                select(Booking)
                .join(TicketPass, TicketPass.booking_id == Booking.id)
                .where(
                    TicketPass.session_id == session_id,
                    Booking.status == "held",
                    Booking.hold_expires_at.is_not(None),
                    Booking.hold_expires_at <= now_utc,
                )
                .distinct()
            )
        )
        .scalars()
        .all()
    )
    for bk in held_bookings:
        passes = list(
            (await db.execute(select(TicketPass).where(TicketPass.booking_id == bk.id))).scalars().all()
        )
        tier_counts: dict[str, int] = {}
        active_count = 0
        for p in passes:
            if p.status == "valid":
                p.status = "expired"
                active_count += 1
                if p.tier_id:
                    tier_counts[p.tier_id] = tier_counts.get(p.tier_id, 0) + 1
        bk.status = "expired"
        db.add(
            BookingStatusHistory(
                booking_id=bk.id,
                from_status="held",
                to_status="expired",
                reason="Ticket hold expired automatically",
            )
        )
        if active_count > 0:
            await db.execute(
                update(EventSession)
                .where(EventSession.id == session_id)
                .values(reserved_count=EventSession.reserved_count - active_count)
            )
            for tid, cnt in tier_counts.items():
                await db.execute(
                    update(TicketTier)
                    .where(TicketTier.id == tid)
                    .values(reserved_count=TicketTier.reserved_count - cnt)
                )


async def reserve_session_transactional(
    db: AsyncSession,
    *,
    actor: User,
    customer_id: str,
    booking_model: str,
    session_id: str,
    lines: list[dict],
    payment_method: str = "in_person",
    notes: str | None = None,
    idempotency_key: str | None = None,
    hold_only: bool = False,
    now_utc: datetime | None = None,
) -> Booking:
    ref_now = now_utc or utc_now()
    if booking_model not in ("ticket", "capacity"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking model must be ticket or capacity")

    if idempotency_key:
        existing_idem = (
            await db.execute(select(Booking).where(Booking.idempotency_key == idempotency_key))
        ).scalar_one_or_none()
        if existing_idem:
            if existing_idem.customer_id != customer_id and not actor.is_platform_admin:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Idempotency key belongs to another user")
            return existing_idem

    # Lock session row first to enforce consistent lock order
    session = (
        await db.execute(
            select(EventSession)
            .options(selectinload(EventSession.offering))
            .where(EventSession.id == session_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not session or not session.offering or not session.offering.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event session not found or inactive")

    if session.offering.booking_model != booking_model:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Session belongs to booking model '{session.offering.booking_model}', not '{booking_model}'",
        )

    business = await db.get(Business, session.business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    if not business.is_public or business.status != "approved":
        membership = await get_active_membership(db, actor.id, business.id)
        if not actor.is_platform_admin and business.owner_user_id != actor.id and not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This business is not open for booking")

    await expire_stale_session_holds(db, session_id=session.id, now_utc=ref_now)
    await db.refresh(session)

    if session.status not in ("scheduled", "on_sale"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Session is {session.status}")
    if session.sales_start_at and ref_now < session.sales_start_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sales have not opened for this session")
    if session.sales_end_at and ref_now > session.sales_end_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sales window has closed for this session")
    if session.end_at <= ref_now:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This session has already ended")

    if not lines:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Select at least one ticket or spot")

    total_qty = sum(int(item["quantity"]) for item in lines)
    if total_qty <= 0 or total_qty > session.max_per_booking:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Quantity must be between 1 and {session.max_per_booking}",
        )

    # Lock tiers in deterministic ID order to avoid deadlocks
    tier_ids = sorted({str(item["tier_id"]) for item in lines if item.get("tier_id")})
    tier_map: dict[str, TicketTier] = {}
    if tier_ids:
        locked_tiers = list(
            (
                await db.execute(
                    select(TicketTier)
                    .where(
                        TicketTier.id.in_(tier_ids),
                        TicketTier.session_id == session.id,
                        TicketTier.business_id == business.id,
                        TicketTier.active.is_(True),
                    )
                    .order_by(TicketTier.id.asc())
                    .with_for_update()
                )
            )
            .scalars()
            .all()
        )
        tier_map = {t.id: t for t in locked_tiers}
        for tid in tier_ids:
            if tid not in tier_map:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Ticket tier unavailable: {tid}")
    else:
        # Fallback for tierless capacity booking: pick first active tier if one exists
        default_tier = (
            await db.execute(
                select(TicketTier)
                .where(TicketTier.session_id == session.id, TicketTier.active.is_(True))
                .order_by(TicketTier.sort_order.asc())
                .with_for_update()
            )
        ).scalars().first()
        if default_tier:
            tier_map[default_tier.id] = default_tier
            for item in lines:
                item["tier_id"] = default_tier.id

    # Atomic guarded session capacity update
    updated_session = (
        await db.execute(
            update(EventSession)
            .where(
                EventSession.id == session.id,
                EventSession.status.in_(("scheduled", "on_sale")),
                EventSession.reserved_count + total_qty <= EventSession.total_capacity,
            )
            .values(reserved_count=EventSession.reserved_count + total_qty)
            .returning(EventSession.reserved_count, EventSession.total_capacity)
        )
    ).first()
    if not updated_session:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Insufficient remaining capacity")

    new_reserved, cap_total = updated_session
    if new_reserved >= cap_total:
        session.status = "sold_out"

    # Guarded per-tier capacity updates
    tier_qty_totals: dict[str, int] = {}
    for item in lines:
        tid = item.get("tier_id")
        if tid:
            tier_qty_totals[tid] = tier_qty_totals.get(tid, 0) + int(item["quantity"])

    for tid, qty in sorted(tier_qty_totals.items()):
        tier = tier_map[tid]
        res = (
            await db.execute(
                update(TicketTier)
                .where(
                    TicketTier.id == tid,
                    (TicketTier.capacity_limit.is_(None))
                    | (TicketTier.reserved_count + qty <= TicketTier.capacity_limit),
                )
                .values(reserved_count=TicketTier.reserved_count + qty)
                .returning(TicketTier.id)
            )
        ).first()
        if not res:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Tier '{tier.name}' does not have enough tickets remaining",
            )

    policy = await get_effective_booking_config(db, business=business, booking_model=booking_model)
    subtotal = 0.0
    currency = "USD"
    passes_to_create: list[TicketPass] = []

    booking_id = new_id("bk")
    check_in_code = f"BK-{secrets.token_hex(3).upper()}"
    for item in lines:
        tid = item.get("tier_id")
        qty = int(item["quantity"])
        names = list(item.get("attendee_names") or [])
        tier = tier_map.get(tid) if tid else None
        unit_price = float(tier.price) if tier else 0.0
        if tier:
            currency = tier.currency
        subtotal += unit_price * qty
        for idx in range(qty):
            attendee_name = names[idx].strip() if idx < len(names) and names[idx].strip() else None
            passes_to_create.append(
                TicketPass(
                    id=new_id("tkt"),
                    booking_id=booking_id,
                    business_id=business.id,
                    session_id=session.id,
                    tier_id=tid,
                    attendee_name=attendee_name,
                    unit_price=unit_price,
                    pass_code=f"TKT-{secrets.token_hex(4).upper()}",
                    status="valid",
                )
            )

    subtotal = round(subtotal, 2)
    deposit_due = compute_deposit_amount(total_amount=subtotal, policy=policy)
    if hold_only:
        booking_status = "held"
        hold_expires_at = ref_now + timedelta(minutes=policy.hold_ttl_minutes)
    else:
        booking_status = "pending" if policy.approval_mode == "manual" else "confirmed"
        hold_expires_at = None

    is_paid = payment_method == "wallet" and not hold_only
    booking = Booking(
        id=booking_id,
        business_id=business.id,
        customer_id=customer_id,
        booking_model=booking_model,
        title_snapshot=session.title_override or session.offering.title,
        start_at=session.start_at,
        end_at=session.end_at,
        timezone=session.timezone,
        quantity=total_qty,
        status=booking_status,
        confirmation_mode="manual" if policy.approval_mode == "manual" else "automatic",
        subtotal_amount=subtotal,
        discount_amount=0,
        tax_amount=0,
        total_amount=subtotal,
        deposit_due_amount=deposit_due,
        amount_paid=subtotal if is_paid else 0,
        refunded_amount=0,
        currency=currency,
        payment_status="paid" if is_paid else "unpaid",
        payment_method=payment_method,
        cancellation_cutoff_at=compute_cancellation_cutoff(session.start_at, policy),
        cancellation_policy_snapshot=session.offering.cancellation_policy or policy.cancellation_policy_text,
        notes=notes.strip() if notes and notes.strip() else None,
        metadata_json={
            "offeringId": session.offering_id,
            "sessionId": session.id,
            "ticketCount": total_qty,
        },
        hold_expires_at=hold_expires_at,
        idempotency_key=idempotency_key,
        check_in_code=check_in_code,
    )
    db.add(booking)
    db.add_all(passes_to_create)
    db.add(
        BookingStatusHistory(
            booking_id=booking_id,
            from_status=None,
            to_status=booking_status,
            changed_by_user_id=actor.id,
            reason=f"{booking_model.capitalize()} booking created ({total_qty} spot(s))",
        )
    )
    db.add(
        Notification(
            user_id=customer_id,
            business_id=business.id,
            category="booking",
            title="Tickets & pass confirmed" if booking_status == "confirmed" else "Spot request sent",
            body=f"{booking.title_snapshot} · {total_qty} pass(es)",
            href=f"/bookings/{booking_id}",
        )
    )

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if idempotency_key:
            existing_idem = (
                await db.execute(select(Booking).where(Booking.idempotency_key == idempotency_key))
            ).scalar_one_or_none()
            if existing_idem:
                return existing_idem
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Concurrent capacity conflict while finalizing tickets",
        ) from exc

    await db.refresh(booking)
    return booking
