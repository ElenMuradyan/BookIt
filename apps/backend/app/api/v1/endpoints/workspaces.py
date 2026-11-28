from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_user
from app.core.database import get_db
from app.models.base import new_id, utc_now
from app.models.booking import Appointment, Booking, CustomerNote
from app.models.business import Business
from app.models.catalog import Product
from app.models.commerce import Expense, Invoice, Order, Plan, Subscription
from app.core.config import get_settings
from app.models.engagement import Campaign, Notification, PromoCode, Review
from app.models.user import User
from app.schemas.booking import CustomerNoteIn, CustomerNoteOut
from app.schemas.commerce import (
    ExpenseIn,
    ExpenseOut,
    InvoiceOut,
    PaymentIntentOut,
    PaymentOut,
    PlanChangeIn,
    SubscriptionCancelIn,
    SubscriptionOut,
    SubscriptionRenewIn,
    SubscriptionRenewOut,
)
from app.schemas.engagement import CampaignIn, CampaignOut, PromoIn, PromoOut, ReviewIn, ReviewOut
from app.services.notification_service import (
    build_subscription_lifecycle_email,
    send_user_transactional_email,
)
from app.services.payment_service import create_payment_intent
from app.services.rbac import require_business_permission

router = APIRouter(tags=["workspaces"])


async def _sync_subscription_lifecycle(db: AsyncSession, sub: Subscription) -> Subscription:
    now = utc_now()
    changed = False
    if sub.status == "trialing" and sub.trial_ends_at and sub.trial_ends_at <= now:
        sub.status = "past_due"
        changed = True
    elif sub.status == "active" and sub.renews_at and sub.renews_at <= now:
        sub.status = "past_due"
        changed = True

    if changed:
        plan = await db.get(Plan, sub.plan_id)
        open_inv = (
            await db.execute(
                select(Invoice)
                .where(Invoice.business_id == sub.business_id, Invoice.status == "open")
                .order_by(Invoice.issued_at.desc())
            )
        ).scalars().first()
        if not open_inv and plan:
            db.add(
                Invoice(
                    id=new_id("inv"),
                    business_id=sub.business_id,
                    amount=float(plan.monthly_price),
                    status="open",
                    description=f"Monthly renewal ({plan.name})",
                )
            )
        await db.flush()
    return sub


@router.get("/workspaces/{business_id}/overview")
async def workspace_overview(
    business_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    business, _ = await require_business_permission(db, user, business_id, "overview.view")
    universal_booking_count = (
        await db.execute(select(func.count(Booking.id)).where(Booking.business_id == business_id))
    ).scalar_one()
    legacy_only_booking_count = (
        await db.execute(
            select(func.count(Appointment.id)).where(
                Appointment.business_id == business_id,
                Appointment.booking_id.is_(None),
            )
        )
    ).scalar_one()
    booking_count = int(universal_booking_count) + int(legacy_only_booking_count)
    order_count = (
        await db.execute(select(func.count(Order.id)).where(Order.seller_id == business_id))
    ).scalar_one()
    expense_total = (
        await db.execute(select(func.coalesce(func.sum(Expense.amount), 0)).where(Expense.business_id == business_id))
    ).scalar_one()
    return {
        "businessId": business.id,
        "status": business.status,
        "bookingCount": booking_count,
        "orderCount": int(order_count),
        "expenseTotal": float(expense_total),
    }


@router.post("/workspaces/{business_id}/notes", response_model=CustomerNoteOut, status_code=status.HTTP_201_CREATED)
async def add_customer_note(
    business_id: str,
    payload: CustomerNoteIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "customers.notes")
    customer = await db.get(User, payload.customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    note = CustomerNote(
        id=new_id("note"),
        business_id=business_id,
        customer_id=payload.customer_id,
        author_id=user.id,
        body=payload.body.strip(),
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return CustomerNoteOut.model_validate(note)


@router.post("/workspaces/{business_id}/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
async def add_expense(
    business_id: str,
    payload: ExpenseIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "finance.manage")
    expense = Expense(
        id=new_id("exp"),
        business_id=business_id,
        category=payload.category.strip(),
        amount=payload.amount,
        note=payload.note.strip(),
        incurred_on=payload.incurred_on,
        source="manual",
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return ExpenseOut(
        id=expense.id,
        business_id=expense.business_id,
        category=expense.category,
        amount=float(expense.amount),
        note=expense.note,
        incurred_on=expense.incurred_on,
        source=expense.source,
    )


@router.post("/workspaces/{business_id}/campaigns", response_model=CampaignOut, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    business_id: str,
    payload: CampaignIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "marketing.manage")
    campaign = Campaign(
        id=new_id("cmp"),
        business_id=business_id,
        name=payload.name.strip(),
        channel=payload.channel,
        status="scheduled",
        audience=payload.audience.strip(),
        starts_on=payload.starts_on,
        message=payload.message.strip(),
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return CampaignOut.model_validate(campaign)


@router.post("/workspaces/{business_id}/promos", response_model=PromoOut, status_code=status.HTTP_201_CREATED)
async def create_promo(
    business_id: str,
    payload: PromoIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "marketing.manage")
    existing = (
        await db.execute(
            select(PromoCode).where(PromoCode.business_id == business_id, PromoCode.code == payload.code.upper())
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Promo code already exists for this business")
    promo = PromoCode(
        id=new_id("promo"),
        business_id=business_id,
        code=payload.code.upper(),
        percent_off=payload.percent_off,
        active=True,
        expires_on=payload.expires_on,
        redemptions=0,
    )
    db.add(promo)
    await db.commit()
    await db.refresh(promo)
    return PromoOut.model_validate(promo)


@router.get("/workspaces/{business_id}/subscription", response_model=SubscriptionOut)
async def get_subscription(
    business_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "subscription.manage")
    sub = (
        await db.execute(select(Subscription).where(Subscription.business_id == business_id))
    ).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    await _sync_subscription_lifecycle(db, sub)
    await db.commit()
    await db.refresh(sub)
    return SubscriptionOut.model_validate(sub)


@router.patch("/workspaces/{business_id}/subscription", response_model=SubscriptionOut)
async def change_subscription(
    business_id: str,
    payload: PlanChangeIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, _ = await require_business_permission(db, user, business_id, "subscription.manage")
    plan = await db.get(Plan, payload.plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    sub = (
        await db.execute(select(Subscription).where(Subscription.business_id == business_id))
    ).scalar_one_or_none()
    now = utc_now()
    if sub:
        await _sync_subscription_lifecycle(db, sub)
        sub.plan_id = payload.plan_id
        if sub.status == "canceled":
            sub.status = "active"
            sub.renews_at = now + timedelta(days=30)
        elif sub.status != "trialing":
            sub.status = "active"
    else:
        sub = Subscription(
            id=new_id("sub"),
            business_id=business_id,
            plan_id=payload.plan_id,
            status="trialing",
            trial_ends_at=now + timedelta(days=30),
            renews_at=now + timedelta(days=30),
            started_at=now,
        )
        db.add(sub)

    db.add(
        Invoice(
            id=new_id("inv"),
            business_id=business_id,
            amount=float(plan.monthly_price) if sub.status == "active" else 0.0,
            status="open" if sub.status == "active" else "trial",
            description=(
                f"Plan change to {plan.name} (trial)"
                if sub.status == "trialing"
                else f"Plan change to {plan.name}"
            ),
        )
    )
    db.add(
        Notification(
            id=new_id("ntf"),
            user_id=business.owner_user_id,
            business_id=business_id,
            category="order",
            title=f"Subscription updated to {plan.name}",
            body=f"{business.name} plan is now {plan.name} ({sub.status}).",
            href="/workspace/settings",
        )
    )
    owner = await db.get(User, business.owner_user_id)
    if owner:
        subj, body_txt, html_txt = build_subscription_lifecycle_email(
            recipient_name=f"{owner.first_name} {owner.last_name}".strip() or owner.username,
            business_name=business.name,
            event_kind="changed",
            plan_name=plan.name,
            status_label=sub.status,
        )
        await send_user_transactional_email(
            db, user_id=owner.id, category="order", subject=subj, body=body_txt, html_body=html_txt
        )
    await db.commit()
    await db.refresh(sub)
    return SubscriptionOut.model_validate(sub)


@router.post("/workspaces/{business_id}/subscription/cancel", response_model=SubscriptionOut)
async def cancel_subscription(
    business_id: str,
    payload: SubscriptionCancelIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, _ = await require_business_permission(db, user, business_id, "subscription.manage")
    sub = (
        await db.execute(select(Subscription).where(Subscription.business_id == business_id).with_for_update())
    ).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    if sub.status == "canceled":
        return SubscriptionOut.model_validate(sub)

    sub.status = "canceled"
    if payload.immediate:
        sub.renews_at = utc_now()
    plan = await db.get(Plan, sub.plan_id)
    db.add(
        Notification(
            id=new_id("ntf"),
            user_id=business.owner_user_id,
            business_id=business_id,
            category="order",
            title="Subscription canceled",
            body=f"{business.name} subscription was canceled. {payload.reason or ''}".strip(),
            href="/workspace/settings",
        )
    )
    owner = await db.get(User, business.owner_user_id)
    if owner:
        subj, body_txt, html_txt = build_subscription_lifecycle_email(
            recipient_name=f"{owner.first_name} {owner.last_name}".strip() or owner.username,
            business_name=business.name,
            event_kind="canceled",
            plan_name=plan.name if plan else sub.plan_id,
            status_label="canceled",
            detail=payload.reason,
        )
        await send_user_transactional_email(
            db, user_id=owner.id, category="order", subject=subj, body=body_txt, html_body=html_txt
        )
    await db.commit()
    await db.refresh(sub)
    return SubscriptionOut.model_validate(sub)


@router.post("/workspaces/{business_id}/subscription/renew", response_model=SubscriptionRenewOut)
async def renew_subscription(
    business_id: str,
    payload: SubscriptionRenewIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, _ = await require_business_permission(db, user, business_id, "subscription.manage")
    now = utc_now()
    sub = (
        await db.execute(select(Subscription).where(Subscription.business_id == business_id).with_for_update())
    ).scalar_one_or_none()
    target_plan_id = payload.plan_id or (sub.plan_id if sub else "professional")
    plan = await db.get(Plan, target_plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    if not sub:
        sub = Subscription(
            id=new_id("sub"),
            business_id=business_id,
            plan_id=target_plan_id,
            status="past_due",
            trial_ends_at=now,
            renews_at=now,
            started_at=now,
        )
        db.add(sub)
        await db.flush()
    else:
        sub.plan_id = target_plan_id
        if sub.status == "canceled":
            sub.status = "past_due"

    open_inv = (
        await db.execute(
            select(Invoice)
            .where(Invoice.business_id == business_id, Invoice.status == "open")
            .order_by(Invoice.issued_at.desc())
        )
    ).scalars().first()
    if open_inv:
        open_inv.amount = float(plan.monthly_price)
        open_inv.description = f"Subscription renewal ({plan.name})"
    else:
        open_inv = Invoice(
            id=new_id("inv"),
            business_id=business_id,
            amount=float(plan.monthly_price),
            status="open",
            description=f"Subscription renewal ({plan.name})",
        )
        db.add(open_inv)
    await db.commit()
    await db.refresh(sub)
    await db.refresh(open_inv)

    payment, intent = await create_payment_intent(
        db,
        payer_id=user.id,
        reference_type="subscription",
        reference_id=open_inv.id,
        method=payload.method,
        idempotency_key=payload.idempotency_key,
        actor=user,
    )
    settings = get_settings()
    return SubscriptionRenewOut(
        subscription=SubscriptionOut.model_validate(sub),
        invoice=InvoiceOut(
            id=open_inv.id,
            business_id=open_inv.business_id,
            amount=float(open_inv.amount),
            status=open_inv.status,
            description=open_inv.description,
            issued_at=open_inv.issued_at,
        ),
        payment_intent=PaymentIntentOut(
            payment=PaymentOut(
                id=payment.id,
                payer_id=payment.payer_id,
                business_id=payment.business_id,
                amount=float(payment.amount),
                currency=payment.currency,
                status=payment.status,
                method=payment.method,
                reference_type=payment.reference_type,
                reference_id=payment.reference_id,
                provider=payment.provider,
                provider_reference=payment.provider_reference,
                note=payment.note,
                created_at=payment.created_at,
            ),
            configured=intent.configured,
            provider=intent.provider,
            client_secret=intent.client_secret,
            publishable_key=settings.stripe_publishable_key if intent.provider == "stripe" else None,
            status_detail=intent.status_detail,
        ),
    )


@router.post("/reviews", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def create_review(
    payload: ReviewIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business = await db.get(Business, payload.business_id)
    if not business or not business.is_public or business.status != "approved":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    if payload.appointment_id:
        appt = await db.get(Appointment, payload.appointment_id)
        if not appt or appt.business_id != business.id or appt.customer_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid appointment reference for review")
    if payload.product_id:
        product = await db.get(Product, payload.product_id)
        if not product or product.business_id != business.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid product reference for review")

    review = Review(
        id=new_id("rev"),
        business_id=business.id,
        author_id=user.id,
        appointment_id=payload.appointment_id,
        product_id=payload.product_id,
        rating=payload.rating,
        title=payload.title.strip(),
        body=payload.body.strip(),
        status="published",
    )
    db.add(review)
    await db.flush()

    published_ratings = (
        await db.execute(
            select(Review.rating).where(Review.business_id == business.id, Review.status == "published")
        )
    ).scalars().all()
    if published_ratings:
        business.review_count = len(published_ratings)
        business.rating = round(sum(published_ratings) / len(published_ratings), 1)

    await db.commit()
    await db.refresh(review)
    return ReviewOut.model_validate(review)
