from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ExcludeConstraint, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import text

from app.models.base import Base, TimestampMixin, new_id, utc_now


class BusinessBookingConfig(Base, TimestampMixin):
    __tablename__ = "business_booking_configs"
    __table_args__ = (
        UniqueConstraint("business_id", "booking_model", name="uq_bcfg_business_model"),
        CheckConstraint(
            "booking_model IN ('appointment', 'resource', 'ticket', 'capacity')",
            name="ck_bcfg_booking_model",
        ),
        CheckConstraint("approval_mode IN ('automatic', 'manual')", name="ck_bcfg_approval_mode"),
        CheckConstraint("deposit_mode IN ('none', 'fixed', 'percent')", name="ck_bcfg_deposit_mode"),
        CheckConstraint("min_notice_minutes >= 0", name="ck_bcfg_min_notice"),
        CheckConstraint("max_advance_days >= 1", name="ck_bcfg_max_advance"),
        CheckConstraint("buffer_before_minutes >= 0", name="ck_bcfg_buffer_before"),
        CheckConstraint("buffer_after_minutes >= 0", name="ck_bcfg_buffer_after"),
        CheckConstraint("cancellation_cutoff_hours >= 0", name="ck_bcfg_cancel_cutoff"),
        CheckConstraint(
            "cancellation_fee_percent >= 0 AND cancellation_fee_percent <= 100",
            name="ck_bcfg_cancel_fee_pct",
        ),
        CheckConstraint("deposit_value >= 0", name="ck_bcfg_deposit_value"),
        CheckConstraint("hold_ttl_minutes >= 1", name="ck_bcfg_hold_ttl"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("bcfg"))
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    booking_model: Mapped[str] = mapped_column(String(32), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    approval_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="automatic")
    min_notice_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    max_advance_days: Mapped[int] = mapped_column(Integer, nullable=False, default=90)
    buffer_before_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    buffer_after_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cancellation_cutoff_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    cancellation_fee_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cancellation_policy_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="Free cancellation up to 24 hours before the booking.",
    )
    deposit_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="none")
    deposit_value: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    hold_ttl_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    allow_overbooking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class Booking(Base, TimestampMixin):
    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint(
            "booking_model IN ('appointment', 'resource', 'ticket', 'capacity')",
            name="ck_bookings_model",
        ),
        CheckConstraint(
            "status IN ('held', 'pending', 'confirmed', 'completed', 'cancelled', 'rejected', 'no_show', 'expired')",
            name="ck_bookings_status",
        ),
        CheckConstraint(
            "payment_status IN ('unpaid', 'deposit_paid', 'paid', 'partially_refunded', 'refunded', 'deposit')",
            name="ck_bookings_payment_status",
        ),
        CheckConstraint("end_at IS NULL OR start_at IS NULL OR end_at > start_at", name="ck_bookings_valid_range"),
        CheckConstraint(
            "quantity >= 1 AND subtotal_amount >= 0 AND discount_amount >= 0 AND tax_amount >= 0 "
            "AND total_amount >= 0 AND deposit_due_amount >= 0 AND amount_paid >= 0 AND refunded_amount >= 0",
            name="ck_bookings_non_negative_amounts",
        ),
        Index("ix_bookings_business_model_start", "business_id", "booking_model", "start_at"),
        Index("ix_bookings_customer_start", "customer_id", "start_at"),
        Index(
            "ix_bookings_held_expires",
            "status",
            "hold_expires_at",
            postgresql_where=text("status = 'held'"),
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("bk"))
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    customer_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    booking_model: Mapped[str] = mapped_column(String(32), nullable=False)
    title_snapshot: Mapped[str] = mapped_column(String(200), nullable=False)
    start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="America/Los_Angeles")
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="confirmed", index=True)
    confirmation_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="automatic")
    subtotal_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    discount_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    total_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    deposit_due_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    amount_paid: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    refunded_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    payment_status: Mapped[str] = mapped_column(String(32), nullable=False, default="unpaid")
    payment_method: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cancellation_cutoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_policy_snapshot: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="Free cancellation up to 24 hours before the booking.",
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    check_in_code: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status_history: Mapped[list["BookingStatusHistory"]] = relationship(
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="BookingStatusHistory.changed_at.asc()",
    )
    resource_allocations: Mapped[list["ResourceAllocation"]] = relationship(
        back_populates="booking",
        cascade="all, delete-orphan",
    )
    ticket_passes: Mapped[list["TicketPass"]] = relationship(
        back_populates="booking",
        cascade="all, delete-orphan",
    )


class BookingStatusHistory(Base):
    __tablename__ = "booking_status_history"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("bsh"))
    booking_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[str] = mapped_column(String(32), nullable=False)
    changed_by_user_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    booking: Mapped["Booking"] = relationship(back_populates="status_history")


class Resource(Base, TimestampMixin):
    __tablename__ = "resources"
    __table_args__ = (
        CheckConstraint("units_total >= 1 AND capacity_people >= 1 AND base_price >= 0", name="ck_resources_positive"),
        CheckConstraint(
            "pricing_unit IN ('per_slot', 'per_hour', 'per_day', 'per_night')",
            name="ck_resources_pricing_unit",
        ),
        CheckConstraint("min_duration_minutes >= 15 AND buffer_minutes >= 0", name="ck_resources_durations"),
        Index("ix_resources_business_active_type", "business_id", "active", "resource_type"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("res"))
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(48), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    capacity_people: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    units_total: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    pricing_unit: Mapped[str] = mapped_column(String(24), nullable=False, default="per_hour")
    slot_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    min_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    max_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    buffer_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    base_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    deposit_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    schedule_hours: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    attributes: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    blocks: Mapped[list["ResourceBlock"]] = relationship(
        back_populates="resource",
        cascade="all, delete-orphan",
    )


class ResourceBlock(Base):
    __tablename__ = "resource_blocks"
    __table_args__ = (
        CheckConstraint("end_at > start_at AND units_blocked >= 1", name="ck_resource_blocks_valid"),
        Index("ix_resource_blocks_resource_range", "resource_id", "start_at", "end_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("rblk"))
    resource_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("resources.id", ondelete="CASCADE"),
        nullable=False,
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    units_blocked: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="Maintenance block")
    created_by_user_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    resource: Mapped["Resource"] = relationship(back_populates="blocks")


class ResourceAllocation(Base):
    __tablename__ = "resource_allocations"
    __table_args__ = (
        CheckConstraint("end_at > start_at AND quantity_units >= 1 AND party_size >= 1", name="ck_resource_alloc_valid"),
        CheckConstraint("unit_price >= 0", name="ck_resource_alloc_price"),
        Index("ix_resource_alloc_resource_range", "resource_id", "start_at", "end_at"),
        ExcludeConstraint(
            ("resource_id", "="),
            (text("tstzrange(start_at, end_at, '[)')"), "&&"),
            name="excl_resource_exclusive_unit_overlap",
            where=text("is_exclusive_unit = true AND status IN ('held', 'pending', 'confirmed')"),
            using="gist",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("ral"))
    booking_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    resource_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("resources.id", ondelete="RESTRICT"),
        nullable=False,
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    quantity_units: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    party_size: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_exclusive_unit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="confirmed", index=True)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)

    booking: Mapped["Booking"] = relationship(back_populates="resource_allocations")


class EventOffering(Base, TimestampMixin):
    __tablename__ = "event_offerings"
    __table_args__ = (
        CheckConstraint("booking_model IN ('ticket', 'capacity')", name="ck_event_offerings_model"),
        Index("ix_event_offerings_business_model_active", "business_id", "booking_model", "active"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("evt"))
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    booking_model: Mapped[str] = mapped_column(String(16), nullable=False, default="ticket")
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    venue_area: Mapped[str | None] = mapped_column(String(200), nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancellation_policy: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="Tickets and spots may be cancelled according to venue cutoff rules.",
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    sessions: Mapped[list["EventSession"]] = relationship(
        back_populates="offering",
        cascade="all, delete-orphan",
    )


class EventSession(Base):
    __tablename__ = "event_sessions"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_event_sessions_range"),
        CheckConstraint(
            "total_capacity >= 1 AND reserved_count >= 0 AND reserved_count <= total_capacity AND max_per_booking >= 1",
            name="ck_event_sessions_capacity",
        ),
        CheckConstraint(
            "status IN ('scheduled', 'on_sale', 'sold_out', 'cancelled', 'completed')",
            name="ck_event_sessions_status",
        ),
        Index("ix_event_sessions_business_start", "business_id", "start_at", "status"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("ses"))
    offering_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("event_offerings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    instructor_employee_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    resource_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("resources.id", ondelete="SET NULL"),
        nullable=True,
    )
    title_override: Mapped[str | None] = mapped_column(String(200), nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="America/Los_Angeles")
    sales_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sales_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    reserved_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_per_booking: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="on_sale")

    offering: Mapped["EventOffering"] = relationship(back_populates="sessions")
    tiers: Mapped[list["TicketTier"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="TicketTier.sort_order.asc()",
    )


class TicketTier(Base):
    __tablename__ = "ticket_tiers"
    __table_args__ = (
        CheckConstraint(
            "price >= 0 AND reserved_count >= 0 AND (capacity_limit IS NULL OR (capacity_limit >= 1 AND reserved_count <= capacity_limit))",
            name="ck_ticket_tiers_valid",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("tier"))
    session_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("event_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    capacity_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reserved_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    session: Mapped["EventSession"] = relationship(back_populates="tiers")


class TicketPass(Base):
    __tablename__ = "ticket_passes"
    __table_args__ = (
        CheckConstraint("unit_price >= 0", name="ck_ticket_passes_price"),
        CheckConstraint(
            "status IN ('valid', 'checked_in', 'cancelled', 'refunded', 'expired')",
            name="ck_ticket_passes_status",
        ),
        Index("ix_ticket_passes_session_status", "session_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("tkt"))
    booking_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("event_sessions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    tier_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("ticket_tiers.id", ondelete="RESTRICT"),
        nullable=True,
    )
    attendee_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    attendee_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    seat_label: Mapped[str | None] = mapped_column(String(40), nullable=True)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    pass_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="valid")
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_in_by_user_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    booking: Mapped["Booking"] = relationship(back_populates="ticket_passes")


class Appointment(Base):
    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_appointment_valid_range"),
        Index("ix_appointments_business_start", "business_id", "start_at"),
        Index("ix_appointments_customer_start", "customer_id", "start_at"),
        Index("ix_appointments_employee_range", "employee_id", "start_at", "end_at"),
        ExcludeConstraint(
            ("employee_id", "="),
            (text("tstzrange(start_at, end_at, '[)')"), "&&"),
            name="excl_appointments_no_employee_overlap",
            where=text("status IN ('pending', 'confirmed')"),
            using="gist",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("apt"))
    # CRITICAL: Never use ON DELETE CASCADE here — deleting a universal booking must never delete an appointment.
    booking_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("bookings.id", ondelete="SET NULL"),
        unique=True,
        nullable=True,
    )
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    service_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("services.id", ondelete="RESTRICT"),
        nullable=False,
    )
    employee_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("employees.id", ondelete="RESTRICT"),
        nullable=False,
    )
    customer_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="confirmed", index=True)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    payment_status: Mapped[str] = mapped_column(String(32), nullable=False, default="unpaid")
    payment_method: Mapped[str | None] = mapped_column(String(32), nullable=True)
    confirmation_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="automatic")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    check_in_code: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    status_history: Mapped[list["AppointmentStatusHistory"]] = relationship(
        back_populates="appointment",
        cascade="all, delete-orphan",
        order_by="AppointmentStatusHistory.changed_at.asc()",
    )


class AppointmentStatusHistory(Base):
    __tablename__ = "appointment_status_history"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("ash"))
    appointment_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("appointments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[str] = mapped_column(String(32), nullable=False)
    changed_by_user_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    appointment: Mapped["Appointment"] = relationship(back_populates="status_history")


class CustomerNote(Base):
    __tablename__ = "customer_notes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("note"))
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
