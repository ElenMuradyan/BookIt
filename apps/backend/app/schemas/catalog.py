from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.business import GalleryImageOut, WeeklyHoursSchema
from app.schemas.common import CamelModel


class ServiceIn(CamelModel):
    name: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=8)
    category: str = Field(min_length=2, max_length=80)
    price: float = Field(ge=0)
    duration_minutes: int = Field(gt=0, le=1440)
    cancellation_policy: str = Field(min_length=4)
    image_url: str | None = None
    requires_approval: bool = False
    deposit_amount: float | None = Field(default=None, ge=0)


class ServiceActiveIn(CamelModel):
    active: bool


class ServiceOut(CamelModel):
    id: str
    business_id: str
    name: str
    description: str
    category: str
    price: float
    currency: str
    duration_minutes: int
    image_url: str | None = None
    employee_ids: list[str] = Field(default_factory=list)
    active: bool
    deposit_amount: float | None = None
    requires_approval: bool
    cancellation_policy: str


class EmployeeOut(CamelModel):
    id: str
    business_id: str
    user_id: str
    membership_id: str
    title: str
    bio: str
    service_ids: list[str] = Field(default_factory=list)
    hours: WeeklyHoursSchema
    status: Literal["available", "in_appointment", "off_shift", "on_leave"]
    rating: float


class EmployeeAvailabilityUpdateIn(CamelModel):
    status: Literal["available", "in_appointment", "off_shift", "on_leave"] | None = None
    hours: WeeklyHoursSchema | None = None
    title: str | None = Field(default=None, min_length=2, max_length=120)


class ProductCategoryOut(CamelModel):
    id: str
    name: str
    slug: str


class ProductVariantOut(CamelModel):
    id: str
    sku: str
    label: str
    stock: int
    price_delta: float
    size: str | None = None
    color: str | None = None


class ProductIn(CamelModel):
    name: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=8)
    category_id: str = Field(min_length=2)
    price: float = Field(gt=0)
    stock: int = Field(ge=0)
    image_url: str | None = None


class ProductActiveIn(CamelModel):
    active: bool


class ProductOut(CamelModel):
    id: str
    business_id: str
    category_id: str
    name: str
    description: str
    price: float
    compare_at_price: float | None = None
    currency: str
    image_url: str
    images: list[GalleryImageOut] = Field(default_factory=list)
    stock: int
    active: bool
    variants: list[ProductVariantOut] = Field(default_factory=list)
    rating: float
    review_count: int
    created_at: datetime
    featured: bool
    popular: bool
    discount_label: str | None = None
