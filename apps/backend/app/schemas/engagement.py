from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.auth import AddressOut, CustomerProfileOut, UserOut
from app.schemas.booking import (
    AppointmentOut,
    BusinessBookingConfigOut,
    CustomerNoteOut,
    EventOfferingOut,
    ResourceBlockOut,
    ResourceOut,
    UniversalBookingOut,
)
from app.schemas.business import BusinessApplicationOut, BusinessOut, MembershipOut
from app.schemas.catalog import EmployeeOut, ProductCategoryOut, ProductOut, ServiceOut
from app.schemas.commerce import (
    CartOut,
    ExpenseOut,
    InvoiceOut,
    OrderOut,
    PaymentOut,
    PlanOut,
    SubscriptionOut,
)
from app.schemas.common import CamelModel


class ReviewIn(CamelModel):
    business_id: str
    appointment_id: str | None = None
    product_id: str | None = None
    rating: int = Field(ge=1, le=5)
    title: str = Field(min_length=2, max_length=200)
    body: str = Field(min_length=8, max_length=2000)


class ReviewOut(CamelModel):
    id: str
    business_id: str
    author_id: str
    appointment_id: str | None = None
    product_id: str | None = None
    rating: int
    title: str
    body: str
    created_at: datetime
    status: str


class ReviewModerateIn(CamelModel):
    status: Literal["published", "reported", "hidden"]


class FavoriteToggleIn(CamelModel):
    target_type: Literal["business", "service", "employee", "product"]
    target_id: str
    collection: str = Field(default="Saved", min_length=1, max_length=80)


class FavoriteMoveIn(CamelModel):
    collection: str = Field(min_length=1, max_length=80)


class FavoriteOut(CamelModel):
    id: str
    user_id: str
    target_type: str
    target_id: str
    collection: str
    created_at: datetime


class NotificationOut(CamelModel):
    id: str
    user_id: str
    business_id: str | None = None
    category: str
    title: str
    body: str
    read: bool
    created_at: datetime
    href: str | None = None


class PromoIn(CamelModel):
    code: str = Field(pattern=r"^[A-Z0-9]{4,12}$")
    percent_off: int = Field(ge=1, le=90)
    expires_on: str = Field(min_length=8, max_length=32)


class PromoOut(CamelModel):
    id: str
    business_id: str
    code: str
    percent_off: int
    active: bool
    expires_on: str
    redemptions: int


class CampaignIn(CamelModel):
    name: str = Field(min_length=2, max_length=160)
    channel: Literal["email", "push", "sponsored"]
    audience: str = Field(min_length=2, max_length=200)
    starts_on: str = Field(min_length=8, max_length=32)
    message: str = Field(min_length=4, max_length=2000)


class CampaignOut(CamelModel):
    id: str
    business_id: str
    name: str
    channel: str
    status: str
    audience: str
    starts_on: str
    message: str


class AdvertisementOut(CamelModel):
    id: str
    business_id: str
    title: str
    body: str
    placement: str
    status: str
    budget: float
    starts_at: datetime
    ends_at: datetime


class AdvertisementStatusIn(CamelModel):
    status: Literal["active", "paused", "ended"]


class ReportOut(CamelModel):
    id: str
    reporter_id: str
    target_type: str
    target_id: str
    reason: str
    details: str
    status: str
    created_at: datetime


class ReportStatusIn(CamelModel):
    status: Literal["open", "reviewing", "resolved", "dismissed"]


class BusinessMessageIn(CamelModel):
    body: str = Field(min_length=2, max_length=2000)


class PlatformStatsOut(CamelModel):
    total_users: int
    total_businesses: int
    pending_applications: int
    approved_businesses: int
    total_bookings: int
    total_orders: int
    platform_revenue: float
    active_subscriptions: int
    user_delta: str
    business_delta: str
    subscription_note: str
    revenue_delta: str
    source: str = "database_aggregate"


class AnalyticsPointOut(CamelModel):
    label: str
    value: float


class BootstrapStateOut(CamelModel):
    users: list[UserOut] = Field(default_factory=list)
    customer_profiles: list[CustomerProfileOut] = Field(default_factory=list)
    addresses: list[AddressOut] = Field(default_factory=list)
    memberships: list[MembershipOut] = Field(default_factory=list)
    businesses: list[BusinessOut] = Field(default_factory=list)
    applications: list[BusinessApplicationOut] = Field(default_factory=list)
    services: list[ServiceOut] = Field(default_factory=list)
    employees: list[EmployeeOut] = Field(default_factory=list)
    appointments: list[AppointmentOut] = Field(default_factory=list)
    booking_configs: list[BusinessBookingConfigOut] = Field(default_factory=list)
    resources: list[ResourceOut] = Field(default_factory=list)
    resource_blocks: list[ResourceBlockOut] = Field(default_factory=list)
    event_offerings: list[EventOfferingOut] = Field(default_factory=list)
    bookings: list[UniversalBookingOut] = Field(default_factory=list)
    reviews: list[ReviewOut] = Field(default_factory=list)
    product_categories: list[ProductCategoryOut] = Field(default_factory=list)
    products: list[ProductOut] = Field(default_factory=list)
    carts: list[CartOut] = Field(default_factory=list)
    orders: list[OrderOut] = Field(default_factory=list)
    payments: list[PaymentOut] = Field(default_factory=list)
    plans: list[PlanOut] = Field(default_factory=list)
    subscriptions: list[SubscriptionOut] = Field(default_factory=list)
    invoices: list[InvoiceOut] = Field(default_factory=list)
    notifications: list[NotificationOut] = Field(default_factory=list)
    expenses: list[ExpenseOut] = Field(default_factory=list)
    advertisements: list[AdvertisementOut] = Field(default_factory=list)
    reports: list[ReportOut] = Field(default_factory=list)
    favorites: list[FavoriteOut] = Field(default_factory=list)
    promo_codes: list[PromoOut] = Field(default_factory=list)
    campaigns: list[CampaignOut] = Field(default_factory=list)
    notes: list[CustomerNoteOut] = Field(default_factory=list)
    platform_stats: PlatformStatsOut
    revenue_series: list[AnalyticsPointOut] = Field(default_factory=list)
    booking_series: list[AnalyticsPointOut] = Field(default_factory=list)
    growth_series: list[AnalyticsPointOut] = Field(default_factory=list)
