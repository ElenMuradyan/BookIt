from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field

from app.schemas.auth import validate_strong_password
from app.schemas.common import CamelModel


class DayHoursSchema(CamelModel):
    closed: bool = False
    open: str = "09:00"
    close: str = "17:00"


class WeeklyHoursSchema(CamelModel):
    mon: DayHoursSchema
    tue: DayHoursSchema
    wed: DayHoursSchema
    thu: DayHoursSchema
    fri: DayHoursSchema
    sat: DayHoursSchema
    sun: DayHoursSchema


class GeoPointOut(CamelModel):
    lat: float
    lng: float


class BusinessLocationOut(CamelModel):
    id: str
    label: str
    line1: str
    city: str
    region: str
    postal_code: str
    country: str
    geo: GeoPointOut


class GalleryImageOut(CamelModel):
    id: str
    url: str
    alt: str


class SocialLinkOut(CamelModel):
    label: str
    url: str


class HolidaySchema(CamelModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    name: str = Field(min_length=2, max_length=120)


class BlockedSlotIn(CamelModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    start: str = Field(pattern=r"^\d{2}:\d{2}$")
    end: str = Field(pattern=r"^\d{2}:\d{2}$")
    reason: str = Field(default="Blocked time", max_length=160)


class BlockedSlotOut(BlockedSlotIn):
    id: str


class PublicBusinessOut(CamelModel):
    id: str
    name: str
    category: str
    description: str
    city: str
    address: str
    timezone: str
    location: BusinessLocationOut
    phone: str
    email: str
    website: str | None = None
    socials: list[SocialLinkOut] = Field(default_factory=list)
    logo_url: str | None = None
    cover_url: str | None = None
    gallery: list[GalleryImageOut] = Field(default_factory=list)
    hours: WeeklyHoursSchema
    rating: float
    review_count: int
    price_level: int
    distance_miles: float
    tags: list[str] = Field(default_factory=list)
    cuisine: str | None = None
    specialty: str | None = None
    cancellation_policy: str


class BusinessOut(PublicBusinessOut):
    owner_user_id: str
    legal_name: str
    country: str
    status: str
    is_public: bool
    holidays: list[HolidaySchema] = Field(default_factory=list)
    blocked: list[BlockedSlotOut] = Field(default_factory=list)
    booking_approval: Literal["automatic", "manual"]
    min_notice_minutes: int
    max_advance_days: int
    created_at: datetime
    updated_at: datetime


class BusinessUpdateIn(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, min_length=8)
    phone: str | None = Field(default=None, min_length=7, max_length=40)
    email: EmailStr | None = None
    website: str | None = None
    address: str | None = Field(default=None, min_length=4, max_length=255)
    city: str | None = Field(default=None, min_length=2, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    cancellation_policy: str | None = Field(default=None, min_length=4)
    booking_approval: Literal["automatic", "manual"] | None = None
    min_notice_minutes: int | None = Field(default=None, ge=0, le=10080)
    max_advance_days: int | None = Field(default=None, ge=1, le=365)


class BusinessApplicationCreateIn(CamelModel):
    business_name: str = Field(min_length=2, max_length=200)
    legal_name: str = Field(min_length=2, max_length=200)
    category: str = Field(min_length=2, max_length=64)
    country: str = Field(min_length=2, max_length=120)
    city: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=4, max_length=255)
    phone: str = Field(min_length=7, max_length=40)
    email: EmailStr
    website: str | None = None
    description: str = Field(min_length=20)
    owner_name: str = Field(min_length=3, max_length=160)
    owner_email: EmailStr
    owner_phone: str = Field(min_length=7, max_length=40)
    owner_password: str | None = None
    owner_confirm_password: str | None = None

    def validate_passwords(self) -> None:
        if self.owner_password:
            validate_strong_password(self.owner_password)
            if self.owner_password != self.owner_confirm_password:
                raise ValueError("Passwords do not match")


class BusinessApplicationOut(CamelModel):
    id: str
    business_id: str
    applicant_user_id: str
    status: str
    submitted_at: datetime | None = None
    reviewed_at: datetime | None = None
    reviewer_note: str | None = None
    documents: list[dict[str, str]] = Field(default_factory=list)


class ApplicationReviewIn(CamelModel):
    action: Literal["approve", "reject", "request_info"]
    note: str = ""


class MembershipOut(CamelModel):
    id: str
    user_id: str
    business_id: str
    role: str
    status: str
    title: str | None = None
    created_at: datetime


class InviteMemberIn(CamelModel):
    email: EmailStr
    role: Literal["admin", "manager", "employee", "receptionist", "accountant"]
    title: str = Field(min_length=2, max_length=120)


class MemberRoleUpdateIn(CamelModel):
    role: Literal["admin", "manager", "employee", "receptionist", "accountant"]
