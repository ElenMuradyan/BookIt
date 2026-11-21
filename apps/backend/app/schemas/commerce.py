from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel


class CartItemAddIn(CamelModel):
    product_id: str
    variant_id: str | None = None
    quantity: int = Field(ge=1, le=99)


class CartItemQuantityIn(CamelModel):
    quantity: int = Field(ge=0, le=99)


class CartItemOut(CamelModel):
    id: str
    product_id: str
    variant_id: str | None = None
    quantity: int
    seller_id: str


class CartOut(CamelModel):
    id: str
    user_id: str
    items: list[CartItemOut]
    updated_at: datetime


class CheckoutIn(CamelModel):
    address_id: str
    delivery_method: Literal["standard", "express", "pickup"]
    payment_method: Literal["card_token_pending", "wallet", "in_person", "pay_on_pickup"]
    promo_code: str | None = Field(default=None, max_length=32)


class CheckoutOut(CamelModel):
    order_ids: list[str]
    checkout_group_id: str


class OrderItemOut(CamelModel):
    id: str
    product_id: str
    variant_id: str | None = None
    name: str
    quantity: int
    unit_price: float
    seller_id: str


class OrderOut(CamelModel):
    id: str
    checkout_group_id: str
    user_id: str
    seller_id: str
    items: list[OrderItemOut]
    status: str
    payment_status: str
    payment_method: str
    subtotal: float
    delivery_fee: float
    total: float
    currency: str
    address_id: str
    delivery_method: str
    tracking_placeholder: str | None = None
    created_at: datetime
    updated_at: datetime


class OrderStatusIn(CamelModel):
    status: Literal[
        "pending",
        "confirmed",
        "processing",
        "ready_for_pickup",
        "shipped",
        "completed",
        "cancelled",
        "refunded",
    ]


class PaymentOut(CamelModel):
    id: str
    payer_id: str
    business_id: str
    amount: float
    currency: str
    status: str
    method: str
    reference_type: str
    reference_id: str
    provider: str
    provider_reference: str | None = None
    note: str | None = None
    created_at: datetime


class PaymentIntentCreateIn(CamelModel):
    reference_type: Literal["appointment", "booking", "order", "subscription"]
    reference_id: str
    method: Literal["card_token_pending", "wallet", "in_person", "pay_on_pickup"] = "card_token_pending"
    idempotency_key: str | None = Field(default=None, max_length=128)


class PaymentIntentOut(CamelModel):
    payment: PaymentOut
    configured: bool
    provider: str
    client_secret: str | None = None
    status_detail: str


class PlanOut(CamelModel):
    id: str
    name: str
    monthly_price: float
    description: str
    features: list[str]


class SubscriptionOut(CamelModel):
    id: str
    business_id: str
    plan_id: str
    status: str
    trial_ends_at: datetime | None = None
    renews_at: datetime | None = None
    started_at: datetime


class PlanChangeIn(CamelModel):
    plan_id: Literal["starter", "professional", "enterprise"]


class InvoiceOut(CamelModel):
    id: str
    business_id: str
    amount: float
    status: str
    description: str
    issued_at: datetime


class ExpenseIn(CamelModel):
    category: str = Field(min_length=2, max_length=80)
    amount: float = Field(gt=0)
    note: str = Field(min_length=2, max_length=500)
    incurred_on: str = Field(min_length=8, max_length=32)


class ExpenseOut(CamelModel):
    id: str
    business_id: str
    category: str
    amount: float
    note: str
    incurred_on: str
    source: str
