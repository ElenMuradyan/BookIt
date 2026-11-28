import json
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_user
from app.core.config import get_settings
from app.core.database import get_db
from app.models.commerce import Payment
from app.models.user import User
from app.schemas.commerce import PaymentIntentCreateIn, PaymentIntentOut, PaymentOut, PaymentRefundIn
from app.services.payment_service import create_payment_intent, process_payment_webhook, refund_payment_record
from app.services.rbac import require_business_permission

router = APIRouter(prefix="/payments", tags=["payments"])


def _serialize_payment(p: Payment) -> PaymentOut:
    return PaymentOut(
        id=p.id,
        payer_id=p.payer_id,
        business_id=p.business_id,
        amount=float(p.amount),
        currency=p.currency,
        status=p.status,
        method=p.method,
        reference_type=p.reference_type,
        reference_id=p.reference_id,
        provider=p.provider,
        provider_reference=p.provider_reference,
        note=p.note,
        created_at=p.created_at,
    )


@router.get("", response_model=list[PaymentOut])
async def list_my_payments(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    business_id: str | None = Query(default=None, alias="businessId"),
):
    if business_id:
        await require_business_permission(db, user, business_id, "finance.view")
        stmt = select(Payment).where(Payment.business_id == business_id).order_by(Payment.created_at.desc())
    else:
        stmt = select(Payment).where(Payment.payer_id == user.id).order_by(Payment.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_payment(r) for r in rows]


@router.post("/intents", response_model=PaymentIntentOut, status_code=status.HTTP_201_CREATED)
async def create_intent(
    payload: PaymentIntentCreateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    payment, intent = await create_payment_intent(
        db,
        payer_id=user.id,
        reference_type=payload.reference_type,
        reference_id=payload.reference_id,
        method=payload.method,
        idempotency_key=payload.idempotency_key,
        actor=user,
    )
    settings = get_settings()
    return PaymentIntentOut(
        payment=_serialize_payment(payment),
        configured=intent.configured,
        provider=intent.provider,
        client_secret=intent.client_secret,
        publishable_key=settings.stripe_publishable_key if intent.provider == "stripe" else None,
        status_detail=intent.status_detail,
    )


@router.post("/{payment_id}/refund", response_model=PaymentOut)
async def refund_payment(
    payment_id: str,
    payload: PaymentRefundIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    payment = await refund_payment_record(
        db,
        payment_id=payment_id,
        actor=user,
        amount=payload.amount,
        reason=payload.reason,
    )
    return _serialize_payment(payment)


@router.post("/webhooks/{provider}")
async def payment_webhook(
    provider: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_bookit_signature: Annotated[str | None, Header(alias="X-BookIt-Signature")] = None,
    stripe_signature: Annotated[str | None, Header(alias="Stripe-Signature")] = None,
):
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload") from exc

    return await process_payment_webhook(
        db,
        provider=provider,
        raw_body=raw_body,
        signature_header=x_bookit_signature,
        stripe_signature_header=stripe_signature,
        payload=payload,
    )
