from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_user
from app.core.database import get_db
from app.models.base import new_id, utc_now
from app.models.booking import Appointment, CustomerNote
from app.models.business import Business
from app.models.catalog import Product
from app.models.commerce import Expense, Invoice, Order, Plan, Subscription
from app.models.engagement import Campaign, PromoCode, Review
from app.models.user import User
from app.schemas.booking import CustomerNoteIn, CustomerNoteOut
from app.schemas.commerce import ExpenseIn, ExpenseOut, PlanChangeIn, SubscriptionOut
from app.schemas.engagement import CampaignIn, CampaignOut, PromoIn, PromoOut, ReviewIn, ReviewOut
from app.services.rbac import require_business_permission

router = APIRouter(tags=["workspaces"])


@router.get("/workspaces/{business_id}/overview")
async def workspace_overview(
    business_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    business, _ = await require_business_permission(db, user, business_id, "overview.view")
    booking_count = (
        await db.execute(select(func.count(Appointment.id)).where(Appointment.business_id == business_id))
    ).scalar_one()
    order_count = (
        await db.execute(select(func.count(Order.id)).where(Order.seller_id == business_id))
    ).scalar_one()
    expense_total = (
        await db.execute(select(func.coalesce(func.sum(Expense.amount), 0)).where(Expense.business_id == business_id))
    ).scalar_one()
    return {
        "businessId": business.id,
        "status": business.status,
        "bookingCount": int(booking_count),
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


@router.patch("/workspaces/{business_id}/subscription", response_model=SubscriptionOut)
async def change_subscription(
    business_id: str,
    payload: PlanChangeIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "subscription.manage")
    plan = await db.get(Plan, payload.plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    sub = (
        await db.execute(select(Subscription).where(Subscription.business_id == business_id))
    ).scalar_one_or_none()
    now = utc_now()
    if sub:
        sub.plan_id = payload.plan_id
        sub.status = "trialing" if sub.status == "trialing" else "active"
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
            status="open",
            description=(
                f"Plan change to {plan.name} (trial)"
                if sub.status == "trialing"
                else f"Plan change to {plan.name}"
            ),
        )
    )
    await db.commit()
    await db.refresh(sub)
    return SubscriptionOut.model_validate(sub)


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
