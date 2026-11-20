from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel


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
    customer_id: str | None = None  # Only respected for authorized staff booking on behalf of customer


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
