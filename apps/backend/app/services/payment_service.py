from dataclasses import dataclass
from datetime import timedelta
import logging
from typing import Protocol

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import verify_hmac_signature, verify_stripe_signature
from app.models.base import new_id, utc_now
from app.models.booking import Appointment, Booking, ResourceAllocation
from app.models.business import Business
from app.models.commerce import Invoice, Order, Payment, PaymentWebhookEvent, Plan, Subscription
from app.models.engagement import Notification
from app.models.user import User
from app.services.notification_service import (
    build_payment_lifecycle_email,
    build_subscription_lifecycle_email,
    send_user_transactional_email,
)
from app.services.rbac import require_business_permission

logger = logging.getLogger("bookit.payments")


@dataclass(frozen=True)
class ProviderIntentResult:
    configured: bool
    provider: str
    provider_reference: str | None
    client_secret: str | None
    payment_status: str
    status_detail: str


@dataclass(frozen=True)
class ProviderRefundResult:
    refund_reference: str | None
    status_detail: str


class PaymentProvider(Protocol):
    name: str

    async def create_intent(
        self,
        *,
        amount: float,
        currency: str,
        reference_type: str,
        reference_id: str,
        idempotency_key: str,
        metadata: dict[str, str] | None = None,
    ) -> ProviderIntentResult: ...

    async def refund_payment(
        self,
        *,
        provider_reference: str,
        amount: float | None,
        reason: str | None,
        idempotency_key: str,
    ) -> ProviderRefundResult: ...


class UnconfiguredPaymentProvider:
    name = "sandbox_unconfigured"

    async def create_intent(
        self,
        *,
        amount: float,
        currency: str,
        reference_type: str,
        reference_id: str,
        idempotency_key: str,
        metadata: dict[str, str] | None = None,
    ) -> ProviderIntentResult:
        del amount, currency, reference_type, reference_id, idempotency_key, metadata
        return ProviderIntentResult(
            configured=False,
            provider=self.name,
            provider_reference=None,
            client_secret=None,
            payment_status="pending",
            status_detail="External card processor is not configured. Payment recorded as pending intent; no card was charged.",
        )

    async def refund_payment(
        self,
        *,
        provider_reference: str,
        amount: float | None,
        reason: str | None,
        idempotency_key: str,
    ) -> ProviderRefundResult:
        del provider_reference, amount, reason, idempotency_key
        return ProviderRefundResult(
            refund_reference=None,
            status_detail="Recorded refund in local ledger (external card processor unconfigured).",
        )


class SandboxPaymentProvider:
    name = "sandbox"

    async def create_intent(
        self,
        *,
        amount: float,
        currency: str,
        reference_type: str,
        reference_id: str,
        idempotency_key: str,
        metadata: dict[str, str] | None = None,
    ) -> ProviderIntentResult:
        del amount, currency, reference_type, reference_id, idempotency_key, metadata
        ref = new_id("pi_sbx")
        return ProviderIntentResult(
            configured=True,
            provider=self.name,
            provider_reference=ref,
            client_secret=f"{ref}_secret_sandbox",
            payment_status="pending",
            status_detail="Sandbox payment intent created. Confirm via signed webhook.",
        )

    async def refund_payment(
        self,
        *,
        provider_reference: str,
        amount: float | None,
        reason: str | None,
        idempotency_key: str,
    ) -> ProviderRefundResult:
        del provider_reference, amount, reason, idempotency_key
        return ProviderRefundResult(
            refund_reference=new_id("re_sbx"),
            status_detail="Sandbox refund recorded cleanly.",
        )


class StripePaymentProvider:
    name = "stripe"

    def __init__(self, *, secret_key: str, api_base_url: str = "https://api.stripe.com") -> None:
        self.secret_key = secret_key
        self.api_base_url = api_base_url.rstrip("/")

    async def create_intent(
        self,
        *,
        amount: float,
        currency: str,
        reference_type: str,
        reference_id: str,
        idempotency_key: str,
        metadata: dict[str, str] | None = None,
    ) -> ProviderIntentResult:
        amount_cents = max(0, int(round(amount * 100)))
        if amount_cents == 0:
            return ProviderIntentResult(
                configured=True,
                provider=self.name,
                provider_reference=None,
                client_secret=None,
                payment_status="recorded",
                status_detail="Zero-amount payment settled without external charge.",
            )

        form_data: dict[str, str] = {
            "amount": str(amount_cents),
            "currency": currency.lower(),
            "automatic_payment_methods[enabled]": "true",
            "metadata[reference_type]": reference_type,
            "metadata[reference_id]": reference_id,
        }
        if metadata:
            for k, v in metadata.items():
                form_data[f"metadata[{k}]"] = str(v)

        headers = {
            "Authorization": f"Bearer {self.secret_key}",
            "Idempotency-Key": idempotency_key,
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self.api_base_url}/v1/payment_intents",
                    headers=headers,
                    data=form_data,
                )
        except httpx.HTTPError as exc:
            logger.error("Stripe PaymentIntent transport error", extra={"error_type": type(exc).__name__})
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to reach payment processor right now.",
            ) from exc

        if resp.status_code >= 400:
            err_msg = "Payment processor rejected intent creation"
            try:
                err_json = resp.json()
                stripe_err = err_json.get("error") if isinstance(err_json, dict) else None
                if isinstance(stripe_err, dict) and isinstance(stripe_err.get("message"), str):
                    err_msg = stripe_err["message"]
            except ValueError:
                pass
            logger.error("Stripe PaymentIntent error", extra={"status_code": resp.status_code})
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=err_msg)

        data = resp.json()
        return ProviderIntentResult(
            configured=True,
            provider=self.name,
            provider_reference=data.get("id"),
            client_secret=data.get("client_secret"),
            payment_status="pending",
            status_detail="Stripe payment intent created. Awaiting webhook confirmation.",
        )

    async def refund_payment(
        self,
        *,
        provider_reference: str,
        amount: float | None,
        reason: str | None,
        idempotency_key: str,
    ) -> ProviderRefundResult:
        form_data: dict[str, str] = {"payment_intent": provider_reference}
        if amount is not None:
            form_data["amount"] = str(max(1, int(round(amount * 100))))
        if reason and reason.strip().lower() in ("duplicate", "fraudulent", "requested_by_customer"):
            form_data["reason"] = reason.strip().lower()
        headers = {
            "Authorization": f"Bearer {self.secret_key}",
            "Idempotency-Key": idempotency_key,
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self.api_base_url}/v1/refunds",
                    headers=headers,
                    data=form_data,
                )
        except httpx.HTTPError as exc:
            logger.error("Stripe Refund transport error", extra={"error_type": type(exc).__name__})
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to reach payment processor for refund.",
            ) from exc

        if resp.status_code >= 400:
            err_msg = "Payment processor rejected refund request"
            try:
                err_json = resp.json()
                stripe_err = err_json.get("error") if isinstance(err_json, dict) else None
                if isinstance(stripe_err, dict) and isinstance(stripe_err.get("message"), str):
                    err_msg = stripe_err["message"]
            except ValueError:
                pass
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=err_msg)

        data = resp.json()
        return ProviderRefundResult(
            refund_reference=data.get("id"),
            status_detail=f"Stripe refund created ({data.get('status', 'succeeded')}).",
        )


def get_payment_provider() -> PaymentProvider:
    settings = get_settings()
    if settings.payment_provider == "sandbox":
        return SandboxPaymentProvider()
    if settings.payment_provider == "stripe":
        if not settings.stripe_secret_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Stripe secret key is not configured",
            )
        if settings.environment != "production" and settings.stripe_secret_key.startswith("sk_live_"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Live Stripe secret keys are forbidden outside production",
            )
        return StripePaymentProvider(
            secret_key=settings.stripe_secret_key,
            api_base_url=settings.stripe_api_base_url,
        )
    return UnconfiguredPaymentProvider()


async def create_payment_intent(
    db: AsyncSession,
    *,
    payer_id: str,
    reference_type: str,
    reference_id: str,
    method: str,
    idempotency_key: str | None = None,
    actor: User | None = None,
) -> tuple[Payment, ProviderIntentResult]:
    settings = get_settings()
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
    extra_meta: dict[str, str] = {}

    if reference_type == "appointment":
        appt = await db.get(Appointment, reference_id)
        if not appt or appt.customer_id != payer_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
        if appt.status in ("cancelled", "rejected") or appt.payment_status in ("paid", "refunded"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Appointment is not eligible for payment",
            )
        if appt.booking_id:
            bk = await db.get(Booking, appt.booking_id)
            if bk:
                if bk.status in ("cancelled", "rejected", "expired") or bk.payment_status in ("paid", "refunded"):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Booking is not eligible for payment",
                    )
                remaining_total = max(0.0, float(bk.total_amount) - float(bk.amount_paid))
                deposit_due = float(bk.deposit_due_amount)
                if float(bk.amount_paid) == 0 and 0 < deposit_due < remaining_total:
                    amount = round(deposit_due, 2)
                else:
                    amount = round(remaining_total, 2)
            else:
                amount = float(appt.price)
        else:
            amount = float(appt.price)
        business_id = appt.business_id
        currency = appt.currency
    elif reference_type == "booking":
        bk = await db.get(Booking, reference_id)
        if not bk or bk.customer_id != payer_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
        if bk.status in ("cancelled", "rejected", "expired") or bk.payment_status in ("paid", "refunded"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Booking is not eligible for payment",
            )
        remaining_total = max(0.0, float(bk.total_amount) - float(bk.amount_paid))
        deposit_due = float(bk.deposit_due_amount)
        if float(bk.amount_paid) == 0 and 0 < deposit_due < remaining_total:
            amount = round(deposit_due, 2)
        else:
            amount = round(remaining_total, 2)
        business_id = bk.business_id
        currency = bk.currency
    elif reference_type == "order":
        order = await db.get(Order, reference_id)
        if not order or order.user_id != payer_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
        if order.status in ("cancelled", "refunded") or order.payment_status in ("paid", "refunded"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Order is not eligible for payment",
            )
        amount = float(order.total)
        business_id = order.seller_id
        currency = order.currency
    elif reference_type == "subscription":
        sub = await db.get(Subscription, reference_id)
        invoice: Invoice | None = None
        if not sub:
            invoice = await db.get(Invoice, reference_id)
            if invoice:
                sub = (
                    await db.execute(select(Subscription).where(Subscription.business_id == invoice.business_id))
                ).scalar_one_or_none()
        if not sub:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")

        payer_user = actor or await db.get(User, payer_id)
        if not payer_user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
        await require_business_permission(db, payer_user, sub.business_id, "subscription.manage")

        if sub.status == "canceled":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Canceled subscription must be renewed/reactivated first",
            )

        if invoice is None:
            invoice = (
                await db.execute(
                    select(Invoice)
                    .where(Invoice.business_id == sub.business_id, Invoice.status == "open")
                    .order_by(Invoice.issued_at.desc())
                )
            ).scalars().first()
        if invoice:
            if invoice.status == "paid":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice is already paid")
            amount = float(invoice.amount)
            extra_meta["invoice_id"] = invoice.id
        else:
            plan = await db.get(Plan, sub.plan_id)
            if not plan:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription plan not found")
            amount = float(plan.monthly_price)

        business_id = sub.business_id
        currency = "USD"
        extra_meta["subscription_id"] = sub.id
        extra_meta["plan_id"] = sub.plan_id
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported payment reference type")

    provider = get_payment_provider()
    idem = idempotency_key or new_id("idem")
    payment_id = new_id("pay")
    extra_meta["payment_id"] = payment_id
    extra_meta["business_id"] = business_id

    intent = await provider.create_intent(
        amount=amount,
        currency=currency,
        reference_type=reference_type,
        reference_id=reference_id,
        idempotency_key=idem,
        metadata=extra_meta,
    )
    payment = Payment(
        id=payment_id,
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
    if settings.payment_provider == "stripe" and intent.client_secret:
        # Expose publishable key only alongside Stripe PaymentIntent creation when configured
        pass
    return payment, intent


async def _apply_refund_to_reference(
    db: AsyncSession,
    *,
    payment: Payment,
    refunded_amount: float | None = None,
) -> bool:
    """Apply full or partial refund state onto Booking / Appointment / Order / Invoice. Returns True if full refund."""
    paid_amt = float(payment.amount)
    refund_amt = round(paid_amt if refunded_amount is None else min(paid_amt, float(refunded_amount)), 2)
    is_full = refund_amt >= paid_amt or paid_amt <= 0
    payment.status = "refunded" if is_full else "recorded"
    if not is_full:
        payment.note = f"Partially refunded {payment.currency} {refund_amt:.2f} of {paid_amt:.2f}"

    if payment.reference_type == "appointment":
        appt = await db.get(Appointment, payment.reference_id)
        if appt:
            appt.payment_status = "refunded" if is_full else "deposit"
            if appt.booking_id:
                bk = await db.get(Booking, appt.booking_id)
                if bk:
                    bk.refunded_amount = round(min(float(bk.amount_paid), float(bk.refunded_amount) + refund_amt), 2)
                    bk.payment_status = "refunded" if bk.refunded_amount >= float(bk.amount_paid) else "partially_refunded"
    elif payment.reference_type == "booking":
        bk = await db.get(Booking, payment.reference_id)
        if bk:
            bk.refunded_amount = round(min(float(bk.amount_paid), float(bk.refunded_amount) + refund_amt), 2)
            bk.payment_status = "refunded" if bk.refunded_amount >= float(bk.amount_paid) else "partially_refunded"
            if bk.booking_model == "appointment":
                appt = (
                    await db.execute(select(Appointment).where(Appointment.booking_id == bk.id))
                ).scalar_one_or_none()
                if appt:
                    appt.payment_status = "refunded" if bk.payment_status == "refunded" else "deposit"
    elif payment.reference_type == "order":
        order = await db.get(Order, payment.reference_id)
        if order and is_full:
            order.payment_status = "refunded"
    elif payment.reference_type == "subscription":
        invoice = await db.get(Invoice, payment.reference_id)
        if invoice and is_full:
            invoice.status = "refunded"
    return is_full


async def _dispatch_payment_notification_and_email(
    db: AsyncSession,
    *,
    payment: Payment,
    event_kind: str,
    reason: str | None = None,
) -> None:
    payer = await db.get(User, payment.payer_id)
    if not payer:
        return
    href = "/workspace/finance" if payment.reference_type == "subscription" else (
        f"/orders/{payment.reference_id}" if payment.reference_type == "order" else "/bookings"
    )
    title_map = {
        "succeeded": "Payment received",
        "failed": "Payment failed",
        "refunded": "Refund processed",
    }
    body_map = {
        "succeeded": f"{payment.currency} {float(payment.amount):.2f} payment succeeded for {payment.reference_type}.",
        "failed": f"{payment.currency} {float(payment.amount):.2f} payment failed for {payment.reference_type}. {reason or ''}".strip(),
        "refunded": f"{payment.currency} {float(payment.amount):.2f} refund processed for {payment.reference_type}.",
    }
    db.add(
        Notification(
            id=new_id("ntf"),
            user_id=payment.payer_id,
            business_id=payment.business_id,
            category="order" if payment.reference_type == "order" else "booking",
            title=title_map[event_kind],
            body=body_map[event_kind],
            href=href,
        )
    )
    subject, body, html_body = build_payment_lifecycle_email(
        event_kind=event_kind,
        recipient_name=f"{payer.first_name} {payer.last_name}".strip() or payer.username,
        amount=float(payment.amount),
        currency=payment.currency,
        reference_type=payment.reference_type,
        reference_id=payment.reference_id,
        reason=reason,
    )
    await send_user_transactional_email(
        db,
        user_id=payer.id,
        category="order" if payment.reference_type == "order" else "booking",
        subject=subject,
        body=body,
        html_body=html_body,
    )


async def refund_payment_record(
    db: AsyncSession,
    *,
    payment_id: str,
    actor: User,
    amount: float | None = None,
    reason: str | None = None,
) -> Payment:
    payment = (
        await db.execute(select(Payment).where(Payment.id == payment_id).with_for_update())
    ).scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")

    if not actor.is_platform_admin:
        await require_business_permission(db, actor, payment.business_id, "finance.manage")

    if payment.status == "refunded":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment has already been refunded")
    if payment.status != "recorded":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only recorded payments can be refunded (current status: {payment.status})",
        )
    if amount is not None and amount > float(payment.amount):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Refund amount exceeds payment total",
        )

    provider = get_payment_provider()
    if payment.provider == "stripe" and payment.provider_reference:
        if not isinstance(provider, StripePaymentProvider):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Stripe provider must be enabled to refund Stripe charges",
            )
        refund_res = await provider.refund_payment(
            provider_reference=payment.provider_reference,
            amount=amount,
            reason=reason,
            idempotency_key=f"refund_{payment.id}_{amount or 'full'}",
        )
        payment.note = refund_res.status_detail
    elif payment.provider == "sandbox" and payment.provider_reference:
        refund_res = await SandboxPaymentProvider().refund_payment(
            provider_reference=payment.provider_reference,
            amount=amount,
            reason=reason,
            idempotency_key=f"refund_{payment.id}_{amount or 'full'}",
        )
        payment.note = refund_res.status_detail
    else:
        payment.note = reason.strip() if reason and reason.strip() else "Refund recorded by workspace staff."

    await _apply_refund_to_reference(db, payment=payment, refunded_amount=amount)
    await _dispatch_payment_notification_and_email(
        db,
        payment=payment,
        event_kind="refunded",
        reason=reason,
    )
    await db.commit()
    await db.refresh(payment)
    return payment


async def process_payment_webhook(
    db: AsyncSession,
    *,
    provider: str,
    raw_body: bytes,
    signature_header: str | None,
    payload: dict,
    stripe_signature_header: str | None = None,
) -> dict:
    settings = get_settings()
    if provider == "stripe":
        secret = settings.stripe_webhook_secret or settings.payment_webhook_secret
        sig = stripe_signature_header or signature_header
        if not verify_stripe_signature(raw_body, sig, secret):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Stripe webhook signature")
    else:
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
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return {"ok": True, "duplicate": True, "eventId": event_id}

    data_obj = (payload.get("data") or {}).get("object") if isinstance(payload.get("data"), dict) else None
    data_obj = data_obj if isinstance(data_obj, dict) else {}
    metadata = data_obj.get("metadata") if isinstance(data_obj.get("metadata"), dict) else {}

    provider_ref = payload.get("providerReference") or data_obj.get("payment_intent") or data_obj.get("id")
    payment_id = payload.get("paymentId") or metadata.get("payment_id")

    payment: Payment | None = None
    if payment_id:
        payment = (
            await db.execute(select(Payment).where(Payment.id == str(payment_id)).with_for_update())
        ).scalar_one_or_none()
    elif provider_ref:
        payment = (
            await db.execute(
                select(Payment).where(Payment.provider_reference == str(provider_ref)).with_for_update()
            )
        ).scalar_one_or_none()

    if payment:
        if event_type in ("payment.succeeded", "payment_intent.succeeded") and payment.status in ("pending", "failed"):
            payment.status = "recorded"
            payment.note = "Payment settled and verified via webhook."
            if payment.reference_type == "appointment":
                appt = await db.get(Appointment, payment.reference_id)
                if appt:
                    if appt.booking_id:
                        bk = await db.get(Booking, appt.booking_id)
                        if bk:
                            bk.amount_paid = round(
                                min(float(bk.total_amount), float(bk.amount_paid) + float(payment.amount)),
                                2,
                            )
                            bk.payment_status = (
                                "paid" if float(bk.amount_paid) >= float(bk.total_amount) else "deposit_paid"
                            )
                            appt.payment_status = "paid" if bk.payment_status == "paid" else "deposit"
                        else:
                            appt.payment_status = "paid"
                    else:
                        appt.payment_status = "paid"
            elif payment.reference_type == "booking":
                bk = await db.get(Booking, payment.reference_id)
                if bk:
                    bk.amount_paid = round(
                        min(float(bk.total_amount), float(bk.amount_paid) + float(payment.amount)),
                        2,
                    )
                    bk.payment_status = "paid" if float(bk.amount_paid) >= float(bk.total_amount) else "deposit_paid"
                    if bk.status == "held":
                        target_status = "pending" if bk.confirmation_mode == "manual" else "confirmed"
                        bk.status = target_status
                        bk.hold_expires_at = None
                        allocs = list(
                            (await db.execute(select(ResourceAllocation).where(ResourceAllocation.booking_id == bk.id)))
                            .scalars()
                            .all()
                        )
                        for alloc in allocs:
                            if alloc.status == "held":
                                alloc.status = target_status
                    if bk.booking_model == "appointment":
                        appt = (
                            await db.execute(select(Appointment).where(Appointment.booking_id == bk.id))
                        ).scalar_one_or_none()
                        if appt:
                            appt.payment_status = "paid" if bk.payment_status == "paid" else "deposit"
            elif payment.reference_type == "order":
                order = await db.get(Order, payment.reference_id)
                if order:
                    order.payment_status = "paid"
            elif payment.reference_type == "subscription":
                sub = await db.get(Subscription, payment.reference_id)
                invoice = None
                if not sub:
                    invoice = await db.get(Invoice, payment.reference_id)
                    if invoice:
                        sub = (
                            await db.execute(
                                select(Subscription).where(Subscription.business_id == invoice.business_id)
                            )
                        ).scalar_one_or_none()
                else:
                    inv_id = metadata.get("invoice_id")
                    if inv_id:
                        invoice = await db.get(Invoice, str(inv_id))
                    if not invoice:
                        invoice = (
                            await db.execute(
                                select(Invoice)
                                .where(Invoice.business_id == sub.business_id, Invoice.status == "open")
                                .order_by(Invoice.issued_at.desc())
                            )
                        ).scalars().first()
                now = utc_now()
                if invoice:
                    invoice.status = "paid"
                if sub:
                    sub.status = "active"
                    sub.renews_at = now + timedelta(days=30)
            await _dispatch_payment_notification_and_email(db, payment=payment, event_kind="succeeded")

        elif event_type in ("payment.failed", "payment_intent.payment_failed") and payment.status == "pending":
            last_err = data_obj.get("last_payment_error") if isinstance(data_obj.get("last_payment_error"), dict) else {}
            failure_reason = str(
                payload.get("failureReason")
                or last_err.get("message")
                or "Your card payment could not be authorized."
            )[:240]
            payment.status = "failed"
            payment.note = failure_reason
            if payment.reference_type == "subscription":
                sub = await db.get(Subscription, payment.reference_id)
                if not sub:
                    inv = await db.get(Invoice, payment.reference_id)
                    if inv:
                        sub = (
                            await db.execute(select(Subscription).where(Subscription.business_id == inv.business_id))
                        ).scalar_one_or_none()
                if sub:
                    sub.status = "past_due"
                    biz = await db.get(Business, sub.business_id)
                    plan = await db.get(Plan, sub.plan_id)
                    payer = await db.get(User, payment.payer_id)
                    if biz and plan and payer:
                        subj, body_txt, html_txt = build_subscription_lifecycle_email(
                            recipient_name=f"{payer.first_name} {payer.last_name}".strip() or payer.username,
                            business_name=biz.name,
                            event_kind="past_due",
                            plan_name=plan.name,
                            status_label="past_due",
                            detail=failure_reason,
                        )
                        await send_user_transactional_email(
                            db,
                            user_id=payer.id,
                            category="order",
                            subject=subj,
                            body=body_txt,
                            html_body=html_txt,
                        )
            await _dispatch_payment_notification_and_email(
                db, payment=payment, event_kind="failed", reason=failure_reason
            )

        elif event_type in ("payment.refunded", "charge.refunded"):
            refund_amt: float | None = None
            if payload.get("refundAmount") is not None:
                refund_amt = float(payload["refundAmount"])
            elif data_obj.get("amount_refunded") is not None:
                refund_amt = round(float(data_obj["amount_refunded"]) / 100.0, 2)
            await _apply_refund_to_reference(db, payment=payment, refunded_amount=refund_amt)
            await _dispatch_payment_notification_and_email(db, payment=payment, event_kind="refunded")

    await db.commit()
    return {"ok": True, "duplicate": False, "eventId": event_id}

