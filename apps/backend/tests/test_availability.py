from datetime import UTC, datetime

from app.services.availability_service import compute_available_slots

STANDARD_HOURS = {
    "mon": {"closed": False, "open": "09:00", "close": "12:00"},
    "tue": {"closed": False, "open": "09:00", "close": "12:00"},
    "wed": {"closed": False, "open": "09:00", "close": "12:00"},
    "thu": {"closed": False, "open": "09:00", "close": "12:00"},
    "fri": {"closed": False, "open": "09:00", "close": "12:00"},
    "sat": {"closed": True, "open": "00:00", "close": "00:00"},
    "sun": {"closed": True, "open": "00:00", "close": "00:00"},
}


def test_holiday_and_closed_day_return_empty():
    slots_holiday = compute_available_slots(
        target_date_str="2026-11-26",
        tz_name="America/Los_Angeles",
        duration_minutes=45,
        business_hours=STANDARD_HOURS,
        holidays=[{"date": "2026-11-26", "name": "Thanksgiving"}],
        blocked=[],
        employees=[{"id": "emp_1", "status": "available", "hours": STANDARD_HOURS}],
        existing_appointments=[],
        enforce_advance_window=False,
    )
    assert slots_holiday == []

    # Saturday is closed
    slots_sat = compute_available_slots(
        target_date_str="2026-11-21",
        tz_name="America/Los_Angeles",
        duration_minutes=30,
        business_hours=STANDARD_HOURS,
        holidays=[],
        blocked=[],
        employees=[{"id": "emp_1", "status": "available", "hours": STANDARD_HOURS}],
        existing_appointments=[],
        enforce_advance_window=False,
    )
    assert slots_sat == []


def test_blocked_time_and_existing_bookings_and_min_notice():
    # 2026-11-23 is Monday in Seattle (UTC-8 in Nov)
    # 09:00 PST = 17:00 UTC
    now = datetime(2026, 11, 23, 17, 15, tzinfo=UTC)  # 09:15 local
    existing = [
        (
            "emp_1",
            datetime(2026, 11, 23, 18, 0, tzinfo=UTC),  # 10:00 PST
            datetime(2026, 11, 23, 18, 45, tzinfo=UTC),  # 10:45 PST
            "confirmed",
        ),
        (
            "emp_1",
            datetime(2026, 11, 23, 19, 0, tzinfo=UTC),
            datetime(2026, 11, 23, 19, 45, tzinfo=UTC),
            "cancelled",  # Cancelled bookings must NOT block slots
        ),
    ]
    slots = compute_available_slots(
        target_date_str="2026-11-23",
        tz_name="America/Los_Angeles",
        duration_minutes=45,
        business_hours=STANDARD_HOURS,
        holidays=[],
        blocked=[{"date": "2026-11-23", "start": "11:00", "end": "11:30", "reason": "Break"}],
        employees=[{"id": "emp_1", "status": "available", "hours": STANDARD_HOURS}],
        existing_appointments=existing,
        min_notice_minutes=30,  # earliest after 09:15 + 30m = 09:45 -> 09:00 & 09:30 excluded
        max_advance_days=30,
        now_utc=now,
        enforce_advance_window=True,
    )
    labels = [s.time_label for s in slots]
    # 09:00/09:30 fail min notice; 10:00 & 10:30 overlap 10:00-10:45 booking; 11:00 overlaps 11:00-11:30 block; 11:30+45m > 12:00 close
    assert labels == []

    # Without min notice, 09:00 works (09:00-09:45 fits before 10:00) and 19:00 cancelled doesn't block
    slots_no_notice = compute_available_slots(
        target_date_str="2026-11-23",
        tz_name="America/Los_Angeles",
        duration_minutes=45,
        business_hours=STANDARD_HOURS,
        holidays=[],
        blocked=[{"date": "2026-11-23", "start": "11:00", "end": "11:30", "reason": "Break"}],
        employees=[{"id": "emp_1", "status": "available", "hours": STANDARD_HOURS}],
        existing_appointments=existing,
        enforce_advance_window=False,
    )
    assert [s.time_label for s in slots_no_notice] == ["09:00"]


def test_max_advance_days_and_off_shift_staff():
    now = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)
    far_slots = compute_available_slots(
        target_date_str="2027-06-01",
        tz_name="America/Los_Angeles",
        duration_minutes=30,
        business_hours=STANDARD_HOURS,
        holidays=[],
        blocked=[],
        employees=[{"id": "emp_1", "status": "available", "hours": STANDARD_HOURS}],
        existing_appointments=[],
        max_advance_days=30,
        now_utc=now,
        enforce_advance_window=True,
    )
    assert far_slots == []

    off_shift = compute_available_slots(
        target_date_str="2026-11-23",
        tz_name="America/Los_Angeles",
        duration_minutes=30,
        business_hours=STANDARD_HOURS,
        holidays=[],
        blocked=[],
        employees=[{"id": "emp_1", "status": "off_shift", "hours": STANDARD_HOURS}],
        existing_appointments=[],
        enforce_advance_window=False,
    )
    assert off_shift == []
