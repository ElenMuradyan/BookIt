from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
ACTIVE_BOOKING_STATUSES = {"pending", "confirmed"}


@dataclass(frozen=True)
class TimeInterval:
    start: datetime
    end: datetime


@dataclass(frozen=True)
class ComputedSlot:
    time_label: str
    start_at: datetime
    end_at: datetime
    employee_ids: list[str]


def get_zone_info(tz_name: str | None) -> ZoneInfo:
    if not tz_name:
        return ZoneInfo("America/Los_Angeles")
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("America/Los_Angeles")


def parse_local_slot_to_utc(date_str: str, time_str: str, tz_name: str, duration_minutes: int) -> TimeInterval:
    tz = get_zone_info(tz_name)
    target_date = date.fromisoformat(date_str)
    hh, mm = map(int, time_str.split(":"))
    local_start = datetime.combine(target_date, time(hour=hh, minute=mm), tzinfo=tz)
    local_end = local_start + timedelta(minutes=duration_minutes)
    return TimeInterval(
        start=local_start.astimezone(UTC),
        end=local_end.astimezone(UTC),
    )


def intervals_overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end


def _parse_hhmm(target_date: date, hhmm: str, tz: ZoneInfo) -> datetime:
    hh, mm = map(int, hhmm.split(":"))
    return datetime.combine(target_date, time(hour=hh, minute=mm), tzinfo=tz).astimezone(UTC)


def compute_available_slots(
    *,
    target_date_str: str,
    tz_name: str,
    duration_minutes: int,
    business_hours: dict,
    holidays: list[dict],
    blocked: list[dict],
    employees: list[dict],
    existing_appointments: list[tuple[str, datetime, datetime, str]],
    min_notice_minutes: int = 30,
    max_advance_days: int = 90,
    now_utc: datetime | None = None,
    employee_id_filter: str | None = None,
    slot_step_minutes: int = 30,
    enforce_advance_window: bool = True,
) -> list[ComputedSlot]:
    """
    Pure, deterministic, timezone-aware availability engine.
    `employees` dicts must include: id, status, hours, service_ids.
    `existing_appointments` tuples are (employee_id, start_at_utc, end_at_utc, status).
    """
    if duration_minutes <= 0:
        return []

    target_date = date.fromisoformat(target_date_str)
    tz = get_zone_info(tz_name)
    reference_now = now_utc or datetime.now(UTC)

    # Check holidays
    if any(h.get("date") == target_date_str for h in holidays):
        return []

    # Check business hours for weekday
    weekday_key = WEEKDAY_KEYS[target_date.weekday()]
    day_cfg = business_hours.get(weekday_key)
    if not day_cfg or day_cfg.get("closed"):
        return []

    biz_open = _parse_hhmm(target_date, day_cfg["open"], tz)
    biz_close = _parse_hhmm(target_date, day_cfg["close"], tz)
    if biz_close <= biz_open:
        return []

    # Advance window checks
    max_allowed_dt = reference_now + timedelta(days=max_advance_days)
    min_allowed_dt = reference_now + timedelta(minutes=min_notice_minutes)
    if enforce_advance_window and biz_open > max_allowed_dt:
        return []

    # Blocked slots on target_date
    blocked_intervals: list[tuple[datetime, datetime]] = []
    for blk in blocked:
        if blk.get("date") == target_date_str:
            b_start = _parse_hhmm(target_date, blk["start"], tz)
            b_end = _parse_hhmm(target_date, blk["end"], tz)
            if b_end > b_start:
                blocked_intervals.append((b_start, b_end))

    # Filter eligible employees
    eligible_employees = []
    for emp in employees:
        if employee_id_filter and emp["id"] != employee_id_filter:
            continue
        if emp.get("status") in ("on_leave", "off_shift"):
            continue
        emp_hours = emp.get("hours", {}).get(weekday_key)
        if not emp_hours or emp_hours.get("closed"):
            continue
        eligible_employees.append(emp)

    if not eligible_employees:
        return []

    duration = timedelta(minutes=duration_minutes)
    step = timedelta(minutes=slot_step_minutes)
    slot_map: dict[str, ComputedSlot] = {}

    for emp in eligible_employees:
        emp_hours = emp["hours"][weekday_key]
        emp_open = max(biz_open, _parse_hhmm(target_date, emp_hours["open"], tz))
        emp_close = min(biz_close, _parse_hhmm(target_date, emp_hours["close"], tz))

        emp_busy = [
            (s, e)
            for (eid, s, e, st) in existing_appointments
            if eid == emp["id"] and st in ACTIVE_BOOKING_STATUSES
        ]

        cursor = emp_open
        while cursor + duration <= emp_close:
            slot_end = cursor + duration

            if enforce_advance_window and (cursor < min_allowed_dt or cursor > max_allowed_dt):
                cursor += step
                continue

            is_blocked = any(intervals_overlap(cursor, slot_end, b_s, b_e) for b_s, b_e in blocked_intervals)
            if is_blocked:
                cursor += step
                continue

            is_busy = any(intervals_overlap(cursor, slot_end, a_s, a_e) for a_s, a_e in emp_busy)
            if is_busy:
                cursor += step
                continue

            local_label = cursor.astimezone(tz).strftime("%H:%M")
            if local_label not in slot_map:
                slot_map[local_label] = ComputedSlot(
                    time_label=local_label,
                    start_at=cursor,
                    end_at=slot_end,
                    employee_ids=[emp["id"]],
                )
            else:
                if emp["id"] not in slot_map[local_label].employee_ids:
                    slot_map[local_label].employee_ids.append(emp["id"])

            cursor += step

    return [slot_map[k] for k in sorted(slot_map.keys())]
