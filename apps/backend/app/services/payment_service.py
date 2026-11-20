from dataclasses import dataclass
from typing import Protocol

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import verify_hmac_signature
from app.models.base import new_id
from app.models.booking import Appointment
from app.models.commerce import Order, Payment, PaymentWebhookEvent


@dataclass(frozen=True)
class ProviderIntentResult:
    configured: bool
    provider: str
    provider_reference: str | None
    client_secret: str | None
    payment_status: str
    status_detail: str


class PaymentProvider(Protocol):
    name: str

    def create_intent(
        self,
        *,
        amount: float,
        currency: str,
        reference_type: str,
        reference_id: str,
        idempotency_key: str,
    ) -> ProviderIntentResult: ...


class UnconfiguredPaymentProvider:
    name = "sandbox_unconfigured"

    def create_intent(
        self,
        *,
        amount: float,
        currency: str,
        reference_type: str,
        reference_id: str,
        idempotency_key: str,
    ) -> ProviderIntentResult:
        return ProviderIntentResult(
            configured=False,
            provider=self.name,
            provider_reference=None,
            client_secret=None,
            payment_status="pending",
            status_detail="External card processor is not configured. Payment recorded as pending intent; no card was charged.",
        )


class SandboxPaymentProvider:
    name = "sandbox"

    def create_intent(
        self,
        *,
        amount: float,
        currency: str,
        reference_type: str,
        reference_id: str,
        idempotency_key: str,
    ) -> ProviderIntentResult:
        ref = new_id("pi_sbx")
        return ProviderIntentResult(
            configured=True,
            provider=self.name,
            provider_reference=ref,
            client_secret=f"{ref}_secret_sandbox",
            payment_status="pending",
            status_detail="Sandbox payment intent created. Confirm via signed webhook.",
        )


def get_payment_provider() -> PaymentProvider:
    settings = get_settings()
    if settings.payment_provider == "sandbox":
        return SandboxPaymentProvider()
    return UnconfiguredPaymentProvider()


async def create_payment_intent(
    db: AsyncSession,
    *,
    payer_id: str,
    reference_type: str,
    reference_id: str,
    method: str,
    idempotency_key: str | None = None,
) -> tuple[Payment, ProviderIntentResult]:
    if idempotency_key:
        existing = (
            await db.execute(select(Payment).where(Payment.idempotency_key == idempotency_key))
        ).scalar_one_or_none()
        if existing:
            if existing.payer_id != payer_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Idempotency key conflict")
            provider = get_payment_provider()
            return existing, ProviderIntentResult(
                configured=provider.name != "sandbox_unconfigured",
                provider=existing.provider,
                provider_reference=existing.provider_reference,
                client_secret=None,
                payment_status=existing.status,
                status_detail="Existing payment intent returned idempotently.",
            )

    amount = 0.0
    business_id = ""
    currency = "USD"
    if reference_type == "appointment":
        appt = await db.get(Appointment, reference_id)
        if not appt or appt.customer_id != payer_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
        amount = float(appt.price)
        business_id = appt.business_id
        currency = appt.currency
    elif reference_type == "order":
        order = await db.get(Order, reference_id)
        if not order or order.user_id != payer_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
        amount = float(order.total)
        business_id = order.seller_id
        currency = order.currency
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported payment reference type")

    provider = get_payment_provider()
    idem = idempotency_key or new_id("idem")
    intent = provider.create_intent(
        amount=amount,
        currency=currency,
        reference_type=reference_type,
        reference_id=reference_id,
        idempotency_key=idem,
    )
    payment = Payment(
        id=new_id("pay"),
        payer_id=payer_id,
        business_id=business_id,
        amount=amount,
        currency=currency,
        status=intent.payment_status,
        method=method,
        reference_type=reference_type,
        reference_id=reference_id,
        provider=intent.provider,
        provider_reference=intent.provider_reference,
        idempotency_key=idem,
        note=intent.status_detail,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    return payment, intent


async def process_payment_webhook(
    db: AsyncSession,
    *,
    provider: str,
    raw_body: bytes,
    signature_header: str | None,
    payload: dict,
) -> dict:
    settings = get_settings()
    if not verify_hmac_signature(raw_body, signature_header, settings.payment_webhook_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    event_id = str(payload.get("eventId") or payload.get("id") or "")
    event_type = str(payload.get("eventType") or payload.get("type") or "")
    if not event_id or not event_type:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Missing eventId or eventType")

    existing_evt = (
        await db.execute(select(PaymentWebhookEvent).where(PaymentWebhookEvent.event_id == event_id))
    ).scalar_one_or_none()
    if existing_evt:
        return {"ok": True, "duplicate": True, "eventId": event_id}

    db.add(
        PaymentWebhookEvent(
            provider=provider,
            event_id=event_id,
            event_type=event_type,
            payload=payload,
        )
    )

    provider_ref = payload.get("providerReference")
    payment_id = payload.get("paymentId")
    payment: Payment | None = None
    if payment_id:
        payment = await db.get(Payment, str(payment_id))
    elif provider_ref:
        payment = (
            await db.execute(select(Payment).where(Payment.provider_reference == str(provider_ref)))
        ).scalar_one_or_none()

    if payment:
        if event_type in ("payment.succeeded", "payment_intent.succeeded"):
            payment.status = "recorded"
            if payment.reference_type == "appointment":
                appt = await db.get(Appointment, payment.reference_id)
                if appt:
                    appt.payment_status = "paid"
            elif payment.reference_type == "order":
                order = await db.get(Order, payment.reference_id)
                if order:
                    order.payment_status = "paid"
        elif event_type in ("payment.refunded", "charge.refunded"):
            payment.status = "refunded"
            if payment.reference_type == "appointment":
                appt = await db.get(Appointment, payment.reference_id)
                if appt:
                    appt.payment_status = "refunded"
            elif payment.reference_type == "order":
                order = await db.get(Order, payment.reference_id)
                if order:
                    order.payment_status = "refunded"

    await db.commit()
    return {"ok": True, "duplicate": False, "eventId": event_id}
