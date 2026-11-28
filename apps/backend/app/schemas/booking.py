from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.schemas.common import CamelModel

BookingModelLiteral = Literal["appointment", "resource", "ticket", "capacity"]
DepositModeLiteral = Literal["none", "fixed", "percent"]
ResourceTypeLiteral = Literal[
    "hotel_room",
    "restaurant_table",
    "sports_court",
    "parking_space",
    "coworking_desk",
    "meeting_room",
    "vehicle",
    "equipment",
    "custom",
]
PricingUnitLiteral = Literal["per_slot", "per_hour", "per_day", "per_night"]


class AvailabilitySlotOut(CamelModel):
    time: str
    start_at: datetime
    end_at: datetime
    employee_ids: list[str]


class AvailabilityOut(CamelModel):
    business_id: str
    service_id: str
    date: str
    timezone: str
    slots: list[str]
    details: list[AvailabilitySlotOut]


class AppointmentCreateIn(CamelModel):
    service_id: str
    employee_id: str
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    time: str = Field(pattern=r"^\d{2}:\d{2}$")
    payment_method: Literal["card_token_pending", "wallet", "in_person", "pay_on_pickup"] = "in_person"
    notes: str | None = Field(default=None, max_length=1000)
    idempotency_key: str | None = Field(default=None, max_length=128)
    customer_id: str | None = None


class AppointmentRescheduleIn(CamelModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    time: str = Field(pattern=r"^\d{2}:\d{2}$")


class AppointmentStatusIn(CamelModel):
    status: Literal["pending", "confirmed", "completed", "cancelled", "rejected", "no_show"]
    reason: str | None = Field(default=None, max_length=500)


class AppointmentNotesIn(CamelModel):
    notes: str = Field(default="", max_length=1000)


class AppointmentCheckIn(CamelModel):
    check_in_code: str = Field(min_length=4, max_length=64)


class AppointmentStatusHistoryOut(CamelModel):
    id: str
    from_status: str | None = None
    to_status: str
    changed_by_user_id: str | None = None
    reason: str | None = None
    changed_at: datetime


class AppointmentOut(CamelModel):
    id: str
    booking_id: str | None = None
    business_id: str
    service_id: str
    employee_id: str
    customer_id: str
    start: datetime
    end: datetime
    status: str
    price: float
    currency: str
    payment_status: str
    payment_method: str | None = None
    confirmation_mode: str
    notes: str | None = None
    check_in_code: str | None = None
    checked_in_at: datetime | None = None
    created_at: datetime


class CustomerNoteIn(CamelModel):
    customer_id: str
    body: str = Field(min_length=2, max_length=2000)


class CustomerNoteOut(CamelModel):
    id: str
    business_id: str
    customer_id: str
    author_id: str
    body: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Phase 2: Business Booking Configurations
# ---------------------------------------------------------------------------


class BusinessBookingConfigIn(CamelModel):
    enabled: bool = True
    display_label: str | None = Field(default=None, max_length=80)
    approval_mode: Literal["automatic", "manual"] = "automatic"
    min_notice_minutes: int = Field(default=30, ge=0, le=10080)
    max_advance_days: int = Field(default=90, ge=1, le=730)
    buffer_before_minutes: int = Field(default=0, ge=0, le=240)
    buffer_after_minutes: int = Field(default=0, ge=0, le=240)
    cancellation_cutoff_hours: int = Field(default=24, ge=0, le=720)
    cancellation_fee_percent: int = Field(default=0, ge=0, le=100)
    cancellation_policy_text: str = Field(
        default="Free cancellation up to 24 hours before the booking.",
        min_length=4,
        max_length=2000,
    )
    deposit_mode: DepositModeLiteral = "none"
    deposit_value: float = Field(default=0, ge=0, le=100000)
    hold_ttl_minutes: int = Field(default=10, ge=1, le=120)
    allow_overbooking: bool = False
    settings: dict[str, Any] = Field(default_factory=dict)


class BusinessBookingConfigOut(CamelModel):
    id: str
    business_id: str
    booking_model: BookingModelLiteral
    enabled: bool
    display_label: str | None = None
    approval_mode: str
    min_notice_minutes: int
    max_advance_days: int
    buffer_before_minutes: int
    buffer_after_minutes: int
    cancellation_cutoff_hours: int
    cancellation_fee_percent: int
    cancellation_policy_text: str
    deposit_mode: str
    deposit_value: float
    hold_ttl_minutes: int
    allow_overbooking: bool
    settings: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Phase 2: Resources & Availability
# ---------------------------------------------------------------------------


class ResourceIn(CamelModel):
    name: str = Field(min_length=2, max_length=200)
    resource_type: ResourceTypeLiteral
    description: str = Field(default="", max_length=2000)
    capacity_people: int = Field(default=1, ge=1, le=500)
    units_total: int = Field(default=1, ge=1, le=1000)
    pricing_unit: PricingUnitLiteral = "per_hour"
    slot_duration_minutes: int | None = Field(default=60, ge=15, le=1440)
    min_duration_minutes: int = Field(default=60, ge=15, le=43200)
    max_duration_minutes: int | None = Field(default=None, ge=15, le=86400)
    buffer_minutes: int = Field(default=0, ge=0, le=240)
    base_price: float = Field(default=0, ge=0, le=100000)
    currency: str = Field(default="USD", min_length=3, max_length=8)
    deposit_amount: float | None = Field(default=None, ge=0, le=100000)
    schedule_hours: dict[str, Any] | None = None
    timezone: str | None = Field(default=None, max_length=64)
    attributes: dict[str, Any] = Field(default_factory=dict)
    image_url: str | None = None
    active: bool = True


class ResourceUpdateIn(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    resource_type: ResourceTypeLiteral | None = None
    description: str | None = Field(default=None, max_length=2000)
    capacity_people: int | None = Field(default=None, ge=1, le=500)
    units_total: int | None = Field(default=None, ge=1, le=1000)
    pricing_unit: PricingUnitLiteral | None = None
    slot_duration_minutes: int | None = Field(default=None, ge=15, le=1440)
    min_duration_minutes: int | None = Field(default=None, ge=15, le=43200)
    max_duration_minutes: int | None = Field(default=None, ge=15, le=86400)
    buffer_minutes: int | None = Field(default=None, ge=0, le=240)
    base_price: float | None = Field(default=None, ge=0, le=100000)
    deposit_amount: float | None = Field(default=None, ge=0, le=100000)
    schedule_hours: dict[str, Any] | None = None
    timezone: str | None = Field(default=None, max_length=64)
    attributes: dict[str, Any] | None = None
    image_url: str | None = None
    active: bool | None = None


class ResourceBlockIn(CamelModel):
    start_at: datetime
    end_at: datetime
    units_blocked: int = Field(default=1, ge=1, le=1000)
    reason: str = Field(default="Maintenance block", min_length=2, max_length=500)


class ResourceBlockOut(CamelModel):
    id: str
    resource_id: str
    start_at: datetime
    end_at: datetime
    units_blocked: int
    reason: str
    created_at: datetime


class ResourceOut(CamelModel):
    id: str
    business_id: str
    name: str
    resource_type: str
    description: str
    capacity_people: int
    units_total: int
    pricing_unit: str
    slot_duration_minutes: int | None = None
    min_duration_minutes: int
    max_duration_minutes: int | None = None
    buffer_minutes: int
    base_price: float
    currency: str
    deposit_amount: float | None = None
    schedule_hours: dict[str, Any] | None = None
    timezone: str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    image_url: str | None = None
    active: bool


class ResourceAvailabilitySlotOut(CamelModel):
    time: str
    start_at: datetime
    end_at: datetime
    remaining_units: int


class ResourceAvailabilityOut(CamelModel):
    business_id: str
    resource_id: str
    date: str
    timezone: str
    units_total: int
    slots: list[ResourceAvailabilitySlotOut]


class ResourceAllocationOut(CamelModel):
    id: str
    resource_id: str
    start_at: datetime
    end_at: datetime
    quantity_units: int
    party_size: int
    status: str
    unit_price: float


class ResourceSearchItemOut(CamelModel):
    resource: ResourceOut
    date: str
    timezone: str
    available_at_requested_time: bool | None = None
    slots: list[ResourceAvailabilitySlotOut] = Field(default_factory=list)


class HotelStayOptionOut(CamelModel):
    resource: ResourceOut
    check_in_at: datetime
    check_out_at: datetime
    nights: int
    remaining_units: int
    nightly_rate: float
    total_price: float
    deposit_due: float


class HotelStayAvailabilityOut(CamelModel):
    business_id: str
    check_in: str
    check_out: str
    check_in_time: str
    check_out_time: str
    nights: int
    guests: int
    timezone: str
    options: list[HotelStayOptionOut] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Phase 2: Ticket & Capacity Offerings / Sessions / Tiers / Passes
# ---------------------------------------------------------------------------


class EventOfferingIn(CamelModel):
    booking_model: Literal["ticket", "capacity"] = "ticket"
    category: str = Field(min_length=2, max_length=64)
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=2000)
    venue_area: str | None = Field(default=None, max_length=200)
    image_url: str | None = None
    cancellation_policy: str = Field(
        default="Tickets and spots may be cancelled according to venue cutoff rules.",
        max_length=2000,
    )
    active: bool = True
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class EventOfferingUpdateIn(CamelModel):
    booking_model: Literal["ticket", "capacity"] | None = None
    category: str | None = Field(default=None, min_length=2, max_length=64)
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    venue_area: str | None = Field(default=None, max_length=200)
    image_url: str | None = None
    cancellation_policy: str | None = Field(default=None, max_length=2000)
    active: bool | None = None
    metadata_json: dict[str, Any] | None = None


class TicketTierIn(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    price: float = Field(ge=0, le=100000)
    currency: str = Field(default="USD", min_length=3, max_length=8)
    capacity_limit: int | None = Field(default=None, ge=1, le=100000)
    sort_order: int = Field(default=0, ge=0, le=1000)
    active: bool = True


class TicketTierUpdateIn(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    price: float | None = Field(default=None, ge=0, le=100000)
    capacity_limit: int | None = Field(default=None, ge=1, le=100000)
    sort_order: int | None = Field(default=None, ge=0, le=1000)
    active: bool | None = None


class TicketTierOut(CamelModel):
    id: str
    session_id: str
    name: str
    description: str
    price: float
    currency: str
    capacity_limit: int | None = None
    reserved_count: int
    remaining: int | None = None
    sort_order: int
    active: bool


class EventSessionIn(CamelModel):
    start_at: datetime
    end_at: datetime
    timezone: str | None = Field(default=None, max_length=64)
    instructor_employee_id: str | None = None
    resource_id: str | None = None
    title_override: str | None = Field(default=None, max_length=200)
    sales_start_at: datetime | None = None
    sales_end_at: datetime | None = None
    total_capacity: int = Field(ge=1, le=100000)
    max_per_booking: int = Field(default=10, ge=1, le=100)
    status: Literal["scheduled", "on_sale", "sold_out", "cancelled", "completed"] = "on_sale"
    tiers: list[TicketTierIn] = Field(default_factory=list)


class EventSessionUpdateIn(CamelModel):
    start_at: datetime | None = None
    end_at: datetime | None = None
    total_capacity: int | None = Field(default=None, ge=1, le=100000)
    max_per_booking: int | None = Field(default=None, ge=1, le=100)
    status: Literal["scheduled", "on_sale", "sold_out", "cancelled", "completed"] | None = None


class EventSessionOut(CamelModel):
    id: str
    offering_id: str
    business_id: str
    instructor_employee_id: str | None = None
    resource_id: str | None = None
    title_override: str | None = None
    start_at: datetime
    end_at: datetime
    timezone: str
    sales_start_at: datetime | None = None
    sales_end_at: datetime | None = None
    total_capacity: int
    reserved_count: int
    remaining_capacity: int
    max_per_booking: int
    status: str
    tiers: list[TicketTierOut] = Field(default_factory=list)


class EventOfferingOut(CamelModel):
    id: str
    business_id: str
    booking_model: Literal["ticket", "capacity"]
    category: str
    title: str
    description: str
    venue_area: str | None = None
    image_url: str | None = None
    cancellation_policy: str
    active: bool
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    sessions: list[EventSessionOut] = Field(default_factory=list)


class TicketPassOut(CamelModel):
    id: str
    booking_id: str
    business_id: str
    session_id: str
    tier_id: str | None = None
    attendee_name: str | None = None
    attendee_email: str | None = None
    seat_label: str | None = None
    unit_price: float
    pass_code: str
    status: str
    checked_in_at: datetime | None = None


class SessionAttendeeOut(CamelModel):
    pass_id: str
    booking_id: str
    session_id: str
    tier_id: str | None = None
    tier_name: str | None = None
    customer_id: str
    customer_name: str
    attendee_name: str | None = None
    booking_status: str
    payment_status: str
    pass_code: str
    pass_status: str
    checked_in_at: datetime | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Phase 2: Universal Bookings & Check-In
# ---------------------------------------------------------------------------


class TicketLineIn(CamelModel):
    tier_id: str
    quantity: int = Field(ge=1, le=50)
    attendee_names: list[str] = Field(default_factory=list)


class UniversalBookingCreateIn(CamelModel):
    booking_model: BookingModelLiteral
    business_id: str | None = None
    customer_id: str | None = None
    payment_method: Literal["card_token_pending", "wallet", "in_person", "pay_on_pickup"] = "in_person"
    notes: str | None = Field(default=None, max_length=1000)
    idempotency_key: str | None = Field(default=None, max_length=128)
    hold_only: bool = False

    # Appointment fields
    service_id: str | None = None
    employee_id: str | None = None
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")

    # Resource fields
    resource_id: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    quantity_units: int = Field(default=1, ge=1, le=100)
    party_size: int = Field(default=1, ge=1, le=500)

    # Ticket / Capacity fields
    session_id: str | None = None
    tier_id: str | None = None
    quantity: int = Field(default=1, ge=1, le=100)
    tickets: list[TicketLineIn] = Field(default_factory=list)
    attendee_names: list[str] = Field(default_factory=list)


class UniversalBookingStatusIn(CamelModel):
    status: Literal["pending", "confirmed", "completed", "cancelled", "rejected", "no_show", "expired"]
    reason: str | None = Field(default=None, max_length=500)


class UniversalBookingStatusHistoryOut(CamelModel):
    id: str
    from_status: str | None = None
    to_status: str
    changed_by_user_id: str | None = None
    reason: str | None = None
    changed_at: datetime


class UniversalBookingOut(CamelModel):
    id: str
    business_id: str
    customer_id: str
    booking_model: BookingModelLiteral
    title: str
    start_at: datetime | None = None
    end_at: datetime | None = None
    timezone: str
    quantity: int
    status: str
    confirmation_mode: str
    subtotal_amount: float
    discount_amount: float
    tax_amount: float
    total_amount: float
    deposit_due_amount: float
    amount_paid: float
    refunded_amount: float
    currency: str
    payment_status: str
    payment_method: str | None = None
    cancellation_cutoff_at: datetime | None = None
    cancellation_policy_snapshot: str
    notes: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    hold_expires_at: datetime | None = None
    check_in_code: str | None = None
    checked_in_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    legacy_appointment_id: str | None = None
    resource_allocations: list[ResourceAllocationOut] = Field(default_factory=list)
    ticket_passes: list[TicketPassOut] = Field(default_factory=list)


class UniversalCheckInOut(CamelModel):
    kind: Literal["appointment", "booking", "ticket_pass"]
    booking_id: str
    business_id: str
    code: str
    status: str
    checked_in_at: datetime
    title: str
    customer_id: str
    legacy_appointment_id: str | None = None
    ticket_pass_id: str | None = None


class UniversalReminderIn(CamelModel):
    message: str | None = Field(default=None, max_length=500)


class UniversalReminderOut(CamelModel):
    ok: bool
    booking_id: str
    delivered: bool
    delivery_status: str
