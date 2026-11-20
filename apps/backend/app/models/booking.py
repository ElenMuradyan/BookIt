from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import text

from app.models.base import Base, new_id, utc_now


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
