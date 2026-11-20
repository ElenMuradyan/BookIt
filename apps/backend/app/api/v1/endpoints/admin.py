from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_platform_admin
from app.core.database import get_db
from app.models.base import new_id, utc_now
from app.models.booking import Appointment
from app.models.business import Business, BusinessApplication
from app.models.commerce import Order, Payment, Subscription
from app.models.engagement import Advertisement, Report, Review
from app.models.user import User
from app.schemas.auth import UserOut
from app.schemas.business import ApplicationReviewIn, BusinessApplicationOut, BusinessOut
from app.schemas.engagement import (
    AdvertisementOut,
    AdvertisementStatusIn,
    ReportOut,
    ReportStatusIn,
    ReviewModerateIn,
    ReviewOut,
)
from app.services.auth_service import record_audit

router = APIRouter(prefix="/admin", tags=["admin"])


class AdminBusinessStatusIn(BaseModel):
    status: str


class AdminUserStatusIn(BaseModel):
    status: str


@router.get("/overview")
async def admin_overview(
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_businesses = (await db.execute(select(func.count(Business.id)))).scalar_one()
    pending_apps = (
        await db.execute(
            select(func.count(BusinessApplication.id)).where(
                BusinessApplication.status.in_(["submitted", "under_review"])
            )
        )
    ).scalar_one()
    approved_businesses = (
        await db.execute(select(func.count(Business.id)).where(Business.status == "approved"))
    ).scalar_one()
    total_bookings = (await db.execute(select(func.count(Appointment.id)))).scalar_one()
    total_orders = (await db.execute(select(func.count(Order.id)))).scalar_one()
    platform_revenue = (
        await db.execute(select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.status == "recorded"))
    ).scalar_one()
    active_subscriptions = (
        await db.execute(
            select(func.count(Subscription.id)).where(Subscription.status.in_(["active", "trialing"]))
        )
    ).scalar_one()
    return {
        "totalUsers": int(total_users),
        "totalBusinesses": int(total_businesses),
        "pendingApplications": int(pending_apps),
        "approvedBusinesses": int(approved_businesses),
        "totalBookings": int(total_bookings),
        "totalOrders": int(total_orders),
        "platformRevenue": float(platform_revenue),
        "activeSubscriptions": int(active_subscriptions),
        "source": "database_aggregate",
    }


@router.post("/applications/{application_id}/review", response_model=BusinessApplicationOut)
async def review_application(
    application_id: str,
    payload: ApplicationReviewIn,
    admin: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    app_row = await db.get(BusinessApplication, application_id)
    if not app_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    next_status = (
        "approved"
        if payload.action == "approve"
        else ("rejected" if payload.action == "reject" else "under_review")
    )
    now = utc_now()
    app_row.status = next_status
    app_row.reviewed_at = now
    app_row.reviewer_note = payload.note or (
        "Please add a clearer license document." if payload.action == "request_info" else None
    )

    business = await db.get(Business, app_row.business_id)
    if business:
        business.status = next_status
        business.is_public = next_status == "approved"

    if next_status == "approved":
        sub = (
            await db.execute(select(Subscription).where(Subscription.business_id == app_row.business_id))
        ).scalar_one_or_none()
        if not sub:
            db.add(
                Subscription(
                    id=new_id("sub"),
                    business_id=app_row.business_id,
                    plan_id="professional",
                    status="trialing",
                    trial_ends_at=now + timedelta(days=30),
                    renews_at=now + timedelta(days=30),
                    started_at=now,
                )
            )

    await record_audit(
        db,
        actor_user_id=admin.id,
        action=f"admin.application_{payload.action}",
        target_type="business_application",
        target_id=app_row.id,
    )
    await db.commit()
    await db.refresh(app_row)
    return BusinessApplicationOut.model_validate(app_row)


@router.patch("/businesses/{business_id}", response_model=BusinessOut)
async def set_business_status(
    business_id: str,
    payload: AdminBusinessStatusIn,
    admin: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.status not in ("draft", "submitted", "under_review", "approved", "rejected", "suspended"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid business status")
    business = await db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    business.status = payload.status
    business.is_public = payload.status == "approved"
    await record_audit(
        db,
        actor_user_id=admin.id,
        action="admin.business_status_changed",
        target_type="business",
        target_id=business.id,
        details={"status": payload.status},
    )
    await db.commit()
    await db.refresh(business)
    return BusinessOut.model_validate(business)


@router.patch("/users/{user_id}", response_model=UserOut)
async def set_user_status(
    user_id: str,
    payload: AdminUserStatusIn,
    admin: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.status not in ("active", "suspended", "pending"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid user status")
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if target.is_platform_admin and payload.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Platform admins cannot be suspended here")
    target.status = payload.status
    await record_audit(
        db,
        actor_user_id=admin.id,
        action="admin.user_status_changed",
        target_type="user",
        target_id=target.id,
        details={"status": payload.status},
    )
    await db.commit()
    await db.refresh(target)
    return UserOut.model_validate(target)


@router.patch("/reviews/{review_id}", response_model=ReviewOut)
async def moderate_review(
    review_id: str,
    payload: ReviewModerateIn,
    admin: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    review.status = payload.status
    await record_audit(
        db,
        actor_user_id=admin.id,
        action="admin.review_moderated",
        target_type="review",
        target_id=review.id,
        details={"status": payload.status},
    )
    await db.commit()
    await db.refresh(review)
    return ReviewOut.model_validate(review)


@router.patch("/advertisements/{ad_id}", response_model=AdvertisementOut)
async def set_advertisement_status(
    ad_id: str,
    payload: AdvertisementStatusIn,
    admin: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ad = await db.get(Advertisement, ad_id)
    if not ad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Advertisement not found")
    ad.status = payload.status
    await db.commit()
    await db.refresh(ad)
    return AdvertisementOut.model_validate(ad)


@router.patch("/reports/{report_id}", response_model=ReportOut)
async def set_report_status(
    report_id: str,
    payload: ReportStatusIn,
    admin: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    report.status = payload.status
    await record_audit(
        db,
        actor_user_id=admin.id,
        action="admin.report_updated",
        target_type="report",
        target_id=report.id,
        details={"status": payload.status},
    )
    await db.commit()
    await db.refresh(report)
    return ReportOut.model_validate(report)
