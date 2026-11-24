import math
import secrets
from datetime import UTC, date, datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import new_id, utc_now
from app.models.booking import (
    Booking,
    BookingStatusHistory,
    Resource,
    ResourceAllocation,
    ResourceBlock,
)
from app.models.business import Business
from app.models.engagement import Notification
from app.models.user import User
from app.services.availability_service import (
    WEEKDAY_KEYS,
    get_zone_info,
    intervals_overlap,
)
from app.services.booking_config_service import (
    compute_cancellation_cutoff,
    compute_deposit_amount,
    get_effective_booking_config,
)
from app.services.rbac import get_active_membership

ACTIVE_ALLOCATION_STATUSES = ("held", "pending", "confirmed")


async def expire_stale_resource_holds(db: AsyncSession, *, resource_id: str, now_utc: datetime) -> None:
    stale_rows = list(
        (
            await db.execute(
                select(Booking, ResourceAllocation)
                .join(ResourceAllocation, ResourceAllocation.booking_id == Booking.id)
                .where(
                    ResourceAllocation.resource_id == resource_id,
                    Booking.status == "held",
                    Booking.hold_expires_at.is_not(None),
                    Booking.hold_expires_at <= now_utc,
                )
            )
        ).all()
    )
    for booking, alloc in stale_rows:
        booking.status = "expired"
        alloc.status = "expired"
        db.add(
            BookingStatusHistory(
                booking_id=booking.id,
                from_status="held",
                to_status="expired",
                reason="Hold expired automatically",
            )
        )


def max_concurrent_units(intervals: list[tuple[datetime, datetime, int]]) -> int:
    events: list[tuple[datetime, int, int]] = []
    for start_at, end_at, qty in intervals:
        if end_at <= start_at or qty <= 0:
            continue
        events.append((start_at, 1, qty))
        events.append((end_at, -1, qty))
    if not events:
        return 0
    # Process end events (-1) before start events (+1) on equal timestamps
    events.sort(key=lambda e: (e[0], e[1]))
    current = 0
    peak = 0
    for _, kind, qty in events:
        current += kind * qty
        if current > peak:
            peak = current
    return peak


def compute_resource_price(
    resource: Resource,
    start_at: datetime,
    end_at: datetime,
    quantity_units: int,
    *,
    business_timezone: str | None = None,
) -> float:
    duration_minutes = max(1.0, (end_at - start_at).total_seconds() / 60.0)
    unit = resource.pricing_unit
    base = float(resource.base_price)
    if unit == "per_slot":
        slot_mins = float(resource.slot_duration_minutes or resource.min_duration_minutes or 60)
        multiplier = max(1, math.ceil(duration_minutes / slot_mins))
    elif unit == "per_hour":
        multiplier = duration_minutes / 60.0
    elif unit == "per_night":
        tz = get_zone_info(resource.timezone or business_timezone or "UTC")
        start_local_date = start_at.astimezone(tz).date()
        end_local_date = end_at.astimezone(tz).date()
        nights = (end_local_date - start_local_date).days
        multiplier = max(1, nights)
    elif unit == "per_day":
        multiplier = max(1, math.ceil(duration_minutes / (24.0 * 60.0)))
    else:
        multiplier = 1.0
    return round(base * multiplier * quantity_units, 2)


async def compute_resource_availability(
    db: AsyncSession,
    *,
    business: Business,
    resource: Resource,
    date_str: str,
    now_utc: datetime | None = None,
    enforce_advance_window: bool = True,
) -> list[dict]:
    tz_name = resource.timezone or business.timezone
    tz = get_zone_info(tz_name)
    target_date = date.fromisoformat(date_str)
    ref_now = now_utc or datetime.now(UTC)

    if any(h.get("date") == target_date.isoformat() for h in (business.holidays or [])):
        return []

    hours_map = resource.schedule_hours or business.hours or {}
    weekday_key = WEEKDAY_KEYS[target_date.weekday()]
    day_cfg = hours_map.get(weekday_key)
    if not day_cfg or day_cfg.get("closed"):
        return []

    open_h, open_m = map(int, day_cfg["open"].split(":"))
    close_h, close_m = map(int, day_cfg["close"].split(":"))
    day_open = datetime.combine(target_date, time(hour=open_h, minute=open_m), tzinfo=tz).astimezone(UTC)
    day_close = datetime.combine(target_date, time(hour=close_h, minute=close_m), tzinfo=tz).astimezone(UTC)
    if day_close <= day_open:
        return []

    policy = await get_effective_booking_config(db, business=business, booking_model="resource")
    min_allowed = ref_now + timedelta(minutes=policy.min_notice_minutes)
    max_allowed = ref_now + timedelta(days=policy.max_advance_days)

    slot_mins = resource.slot_duration_minutes or resource.min_duration_minutes or 60
    raw_interval = policy.settings.get("slotIntervalMinutes") if isinstance(policy.settings, dict) else None
    if isinstance(raw_interval, (int, float)) and 15 <= int(raw_interval) <= 240 and (
        resource.resource_type == "restaurant_table" or resource.pricing_unit != "per_slot"
    ):
        step_mins = int(raw_interval)
    else:
        step_mins = slot_mins if resource.pricing_unit == "per_slot" else min(60, slot_mins)
    slot_delta = timedelta(minutes=slot_mins)
    step_delta = timedelta(minutes=step_mins)

    allocs = list(
        (
            await db.execute(
                select(ResourceAllocation, Booking.hold_expires_at)
                .join(Booking, Booking.id == ResourceAllocation.booking_id)
                .where(
                    ResourceAllocation.resource_id == resource.id,
                    ResourceAllocation.status.in_(ACTIVE_ALLOCATION_STATUSES),
                    ResourceAllocation.end_at > day_open - timedelta(hours=2),
                    ResourceAllocation.start_at < day_close + timedelta(hours=2),
                )
            )
        ).all()
    )
    active_allocs = [
        alloc
        for alloc, hold_exp in allocs
        if not (alloc.status == "held" and hold_exp is not None and hold_exp <= ref_now)
    ]

    blocks = list(
        (
            await db.execute(
                select(ResourceBlock).where(
                    ResourceBlock.resource_id == resource.id,
                    ResourceBlock.end_at > day_open,
                    ResourceBlock.start_at < day_close,
                )
            )
        )
        .scalars()
        .all()
    )

    biz_blocked = []
    for blk in business.blocked or []:
        if blk.get("date") == date_str:
            bh1, bm1 = map(int, blk["start"].split(":"))
            bh2, bm2 = map(int, blk["end"].split(":"))
            bs = datetime.combine(target_date, time(hour=bh1, minute=bm1), tzinfo=tz).astimezone(UTC)
            be = datetime.combine(target_date, time(hour=bh2, minute=bm2), tzinfo=tz).astimezone(UTC)
            if be > bs:
                biz_blocked.append((bs, be))

    slots_out: list[dict] = []
    cursor = day_open
    while cursor + slot_delta <= day_close:
        slot_end = cursor + slot_delta
        if enforce_advance_window and (cursor < min_allowed or cursor > max_allowed):
            cursor += step_delta
            continue

        if any(intervals_overlap(cursor, slot_end, bs, be) for bs, be in biz_blocked):
            cursor += step_delta
            continue

        eff_start = cursor - timedelta(minutes=policy.buffer_before_minutes)
        eff_end = slot_end + timedelta(minutes=max(resource.buffer_minutes, policy.buffer_after_minutes))

        used_units = sum(
            a.quantity_units for a in active_allocs if intervals_overlap(eff_start, eff_end, a.start_at, a.end_at)
        )
        blocked_units = sum(
            b.units_blocked for b in blocks if intervals_overlap(cursor, slot_end, b.start_at, b.end_at)
        )
        remaining = max(0, resource.units_total - used_units - blocked_units)
        if remaining > 0:
            slots_out.append(
                {
                    "time": cursor.astimezone(tz).strftime("%H:%M"),
                    "start_at": cursor,
                    "end_at": slot_end,
                    "remaining_units": remaining,
                }
            )
        cursor += step_delta

    return slots_out


async def reserve_resource_transactional(
    db: AsyncSession,
    *,
    actor: User,
    customer_id: str,
    resource_id: str,
    start_at: datetime,
    end_at: datetime,
    quantity_units: int = 1,
    party_size: int = 1,
    payment_method: str = "in_person",
    notes: str | None = None,
    idempotency_key: str | None = None,
    hold_only: bool = False,
    now_utc: datetime | None = None,
    enforce_advance_window: bool = True,
) -> Booking:
    ref_now = now_utc or utc_now()
    if start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=UTC)
    if end_at.tzinfo is None:
        end_at = end_at.replace(tzinfo=UTC)

    if end_at <= start_at:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="End time must be after start time")

    if idempotency_key:
        existing_idem = (
            await db.execute(select(Booking).where(Booking.idempotency_key == idempotency_key))
        ).scalar_one_or_none()
        if existing_idem:
            if existing_idem.customer_id != customer_id and not actor.is_platform_admin:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Idempotency key belongs to another user")
            return existing_idem

    # Lock resource row inside transaction to serialize unit capacity checks
    resource = (
        await db.execute(select(Resource).where(Resource.id == resource_id, Resource.active.is_(True)).with_for_update())
    ).scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource unavailable")

    business = await db.get(Business, resource.business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    if not business.is_public or business.status != "approved":
        membership = await get_active_membership(db, actor.id, business.id)
        if not actor.is_platform_admin and business.owner_user_id != actor.id and not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This business is not open for booking")

    policy = await get_effective_booking_config(db, business=business, booking_model="resource")

    duration_minutes = (end_at - start_at).total_seconds() / 60.0
    if duration_minutes < resource.min_duration_minutes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Minimum booking duration is {resource.min_duration_minutes} minutes",
        )
    if resource.max_duration_minutes and duration_minutes > resource.max_duration_minutes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Maximum booking duration is {resource.max_duration_minutes} minutes",
        )
    if party_size > resource.capacity_people * quantity_units:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Party size exceeds capacity ({resource.capacity_people} per unit)",
        )
    if quantity_units > resource.units_total:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only {resource.units_total} unit(s) exist for this resource",
        )

    if enforce_advance_window:
        if start_at < ref_now + timedelta(minutes=policy.min_notice_minutes):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Booking violates minimum notice window")
        if start_at > ref_now + timedelta(days=policy.max_advance_days):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Booking exceeds maximum advance window")

    await expire_stale_resource_holds(db, resource_id=resource.id, now_utc=ref_now)

    # Check overlapping allocations & maintenance blocks
    eff_start = start_at - timedelta(minutes=policy.buffer_before_minutes)
    eff_end = end_at + timedelta(minutes=max(resource.buffer_minutes, policy.buffer_after_minutes))

    if resource.pricing_unit == "per_night":
        overlapping_allocs = list(
            (
                await db.execute(
                    select(ResourceAllocation).where(
                        ResourceAllocation.resource_id == resource.id,
                        ResourceAllocation.status.in_(ACTIVE_ALLOCATION_STATUSES),
                        ResourceAllocation.end_at > eff_start,
                        ResourceAllocation.start_at < eff_end,
                    )
                )
            )
            .scalars()
            .all()
        )
        overlapping_blocks = list(
            (
                await db.execute(
                    select(ResourceBlock).where(
                        ResourceBlock.resource_id == resource.id,
                        ResourceBlock.end_at > start_at,
                        ResourceBlock.start_at < end_at,
                    )
                )
            )
            .scalars()
            .all()
        )
        intervals: list[tuple[datetime, datetime, int]] = [
            (max(eff_start, a.start_at), min(eff_end, a.end_at), a.quantity_units)
            for a in overlapping_allocs
        ]
        intervals.extend(
            (max(start_at, b.start_at), min(end_at, b.end_at), b.units_blocked)
            for b in overlapping_blocks
        )
        peak_occupied = max_concurrent_units(intervals)
        if not policy.allow_overbooking and (peak_occupied + quantity_units > resource.units_total):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Selected room type has no remaining availability for those dates",
            )
    else:
        used_units = int(
            (
                await db.execute(
                    select(func.coalesce(func.sum(ResourceAllocation.quantity_units), 0)).where(
                        ResourceAllocation.resource_id == resource.id,
                        ResourceAllocation.status.in_(ACTIVE_ALLOCATION_STATUSES),
                        ResourceAllocation.end_at > eff_start,
                        ResourceAllocation.start_at < eff_end,
                    )
                )
            ).scalar_one()
        )
        blocked_units = int(
            (
                await db.execute(
                    select(func.coalesce(func.sum(ResourceBlock.units_blocked), 0)).where(
                        ResourceBlock.resource_id == resource.id,
                        ResourceBlock.end_at > start_at,
                        ResourceBlock.start_at < end_at,
                    )
                )
            ).scalar_one()
        )

        if not policy.allow_overbooking and (used_units + blocked_units + quantity_units > resource.units_total):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Selected resource is unavailable for the requested time window",
            )

    subtotal = compute_resource_price(
        resource,
        start_at,
        end_at,
        quantity_units,
        business_timezone=business.timezone,
    )
    deposit_due = compute_deposit_amount(
        total_amount=subtotal,
        policy=policy,
        override_deposit=float(resource.deposit_amount) * quantity_units if resource.deposit_amount is not None else None,
    )
    if hold_only:
        booking_status = "held"
        hold_expires_at = ref_now + timedelta(minutes=policy.hold_ttl_minutes)
    else:
        booking_status = "pending" if policy.approval_mode == "manual" else "confirmed"
        hold_expires_at = None

    confirmation_mode = "manual" if policy.approval_mode == "manual" else "automatic"
    booking_id = new_id("bk")
    check_in_code = f"BK-{secrets.token_hex(3).upper()}"
    is_paid = payment_method == "wallet" and not hold_only

    booking = Booking(
        id=booking_id,
        business_id=business.id,
        customer_id=customer_id,
        booking_model="resource",
        title_snapshot=resource.name,
        start_at=start_at,
        end_at=end_at,
        timezone=resource.timezone or business.timezone,
        quantity=quantity_units,
        status=booking_status,
        confirmation_mode=confirmation_mode,
        subtotal_amount=subtotal,
        discount_amount=0,
        tax_amount=0,
        total_amount=subtotal,
        deposit_due_amount=deposit_due,
        amount_paid=subtotal if is_paid else 0,
        refunded_amount=0,
        currency=resource.currency,
        payment_status="paid" if is_paid else "unpaid",
        payment_method=payment_method,
        cancellation_cutoff_at=compute_cancellation_cutoff(start_at, policy),
        cancellation_policy_snapshot=policy.cancellation_policy_text,
        notes=notes.strip() if notes and notes.strip() else None,
        metadata_json={
            "resourceId": resource.id,
            "resourceType": resource.resource_type,
            "partySize": party_size,
            "quantityUnits": quantity_units,
        },
        hold_expires_at=hold_expires_at,
        idempotency_key=idempotency_key,
        check_in_code=check_in_code,
    )
    alloc = ResourceAllocation(
        id=new_id("ral"),
        booking_id=booking_id,
        business_id=business.id,
        resource_id=resource.id,
        start_at=start_at,
        end_at=end_at,
        quantity_units=quantity_units,
        party_size=party_size,
        is_exclusive_unit=(resource.units_total == 1 and not policy.allow_overbooking),
        status=booking_status,
        unit_price=float(resource.base_price),
    )
    db.add(booking)
    db.add(alloc)
    db.add(
        BookingStatusHistory(
            booking_id=booking_id,
            from_status=None,
            to_status=booking_status,
            changed_by_user_id=actor.id,
            reason="Resource reservation created",
        )
    )
    db.add(
        Notification(
            user_id=customer_id,
            business_id=business.id,
            category="booking",
            title=f"Reservation {booking_status}",
            body=f"{resource.name} · {start_at.isoformat()}",
            href=f"/bookings/{booking_id}",
        )
    )
    if business.owner_user_id != customer_id:
        db.add(
            Notification(
                user_id=business.owner_user_id,
                business_id=business.id,
                category="booking",
                title="New resource reservation",
                body=f"{resource.name} reserved ({quantity_units} unit(s)).",
                href="/workspace/bookings",
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
            detail="Resource time window already reserved concurrently",
        ) from exc

    await db.refresh(booking)
    return booking


async def search_hotel_stays_availability(
    db: AsyncSession,
    *,
    business: Business,
    check_in_date: str,
    check_out_date: str,
    guests: int = 1,
    room_type: str | None = None,
    now_utc: datetime | None = None,
    enforce_advance_window: bool = True,
) -> dict:
    in_date = date.fromisoformat(check_in_date)
    out_date = date.fromisoformat(check_out_date)
    if out_date <= in_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Check-out date must be after check-in date",
        )
    nights = (out_date - in_date).days
    ref_now = now_utc or utc_now()

    policy = await get_effective_booking_config(db, business=business, booking_model="resource")
    settings_dict = policy.settings if isinstance(policy.settings, dict) else {}
    check_in_time_str = str(settings_dict.get("checkInTime") or "15:00")
    check_out_time_str = str(settings_dict.get("checkOutTime") or "11:00")
    ci_h, ci_m = map(int, check_in_time_str.split(":"))
    co_h, co_m = map(int, check_out_time_str.split(":"))

    resources = list(
        (
            await db.execute(
                select(Resource)
                .where(
                    Resource.business_id == business.id,
                    Resource.active.is_(True),
                    Resource.resource_type == "hotel_room",
                    Resource.capacity_people >= guests,
                )
                .order_by(Resource.base_price.asc(), Resource.name.asc())
            )
        )
        .scalars()
        .all()
    )

    holiday_dates = {h.get("date") for h in (business.holidays or []) if h.get("date")}
    stay_dates = {(in_date + timedelta(days=offset)).isoformat() for offset in range(nights)}
    if holiday_dates & stay_dates:
        return {
            "business_id": business.id,
            "check_in": check_in_date,
            "check_out": check_out_date,
            "check_in_time": check_in_time_str,
            "check_out_time": check_out_time_str,
            "nights": nights,
            "guests": guests,
            "timezone": business.timezone,
            "options": [],
        }

    options: list[dict] = []
    for res in resources:
        attrs = res.attributes or {}
        if room_type and str(attrs.get("roomType") or "").lower() != room_type.strip().lower():
            continue

        tz = get_zone_info(res.timezone or business.timezone)
        start_at = datetime.combine(in_date, time(hour=ci_h, minute=ci_m), tzinfo=tz).astimezone(UTC)
        end_at = datetime.combine(out_date, time(hour=co_h, minute=co_m), tzinfo=tz).astimezone(UTC)
        duration_minutes = (end_at - start_at).total_seconds() / 60.0
        if duration_minutes < res.min_duration_minutes:
            continue
        if res.max_duration_minutes and duration_minutes > res.max_duration_minutes:
            continue
        if enforce_advance_window:
            if start_at < ref_now + timedelta(minutes=policy.min_notice_minutes):
                continue
            if start_at > ref_now + timedelta(days=policy.max_advance_days):
                continue

        eff_start = start_at - timedelta(minutes=policy.buffer_before_minutes)
        eff_end = end_at + timedelta(minutes=max(res.buffer_minutes, policy.buffer_after_minutes))
        allocs = list(
            (
                await db.execute(
                    select(ResourceAllocation, Booking.hold_expires_at)
                    .join(Booking, Booking.id == ResourceAllocation.booking_id)
                    .where(
                        ResourceAllocation.resource_id == res.id,
                        ResourceAllocation.status.in_(ACTIVE_ALLOCATION_STATUSES),
                        ResourceAllocation.end_at > eff_start,
                        ResourceAllocation.start_at < eff_end,
                    )
                )
            ).all()
        )
        blocks = list(
            (
                await db.execute(
                    select(ResourceBlock).where(
                        ResourceBlock.resource_id == res.id,
                        ResourceBlock.end_at > start_at,
                        ResourceBlock.start_at < end_at,
                    )
                )
            )
            .scalars()
            .all()
        )
        intervals: list[tuple[datetime, datetime, int]] = [
            (max(eff_start, alloc.start_at), min(eff_end, alloc.end_at), alloc.quantity_units)
            for alloc, hold_exp in allocs
            if not (alloc.status == "held" and hold_exp is not None and hold_exp <= ref_now)
        ]
        intervals.extend(
            (max(start_at, blk.start_at), min(end_at, blk.end_at), blk.units_blocked)
            for blk in blocks
        )
        peak_used = max_concurrent_units(intervals)
        remaining = max(0, res.units_total - peak_used)
        if remaining <= 0 and not policy.allow_overbooking:
            continue

        total_price = compute_resource_price(
            res,
            start_at,
            end_at,
            1,
            business_timezone=business.timezone,
        )
        deposit_due = compute_deposit_amount(
            total_amount=total_price,
            policy=policy,
            override_deposit=float(res.deposit_amount) if res.deposit_amount is not None else None,
        )
        options.append(
            {
                "resource": res,
                "check_in_at": start_at,
                "check_out_at": end_at,
                "nights": nights,
                "remaining_units": remaining if remaining > 0 else 1,
                "nightly_rate": float(res.base_price),
                "total_price": total_price,
                "deposit_due": deposit_due,
            }
        )

    return {
        "business_id": business.id,
        "check_in": check_in_date,
        "check_out": check_out_date,
        "check_in_time": check_in_time_str,
        "check_out_time": check_out_time_str,
        "nights": nights,
        "guests": guests,
        "timezone": business.timezone,
        "options": options,
    }
