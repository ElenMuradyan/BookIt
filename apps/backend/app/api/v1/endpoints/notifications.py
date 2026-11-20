from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.rate_limit import auth_rate_limiter, client_ip_from_request
from app.models.base import new_id
from app.models.engagement import Notification
from app.models.user import User
from app.schemas.common import OkResponse
from app.schemas.engagement import BusinessMessageIn, NotificationOut
from app.services.rbac import ensure_business_visible, require_business_permission

router = APIRouter(tags=["notifications"])


@router.get("/notifications", response_model=list[NotificationOut])
async def list_my_notifications(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
            .limit(100)
        )
    ).scalars().all()
    return [NotificationOut.model_validate(r) for r in rows]


@router.post("/notifications/{notification_id}/read", response_model=OkResponse)
async def mark_notification_read(
    notification_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    row = await db.get(Notification, notification_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    row.read = True
    await db.commit()
    return OkResponse(ok=True)


@router.post("/notifications/read-all", response_model=OkResponse)
async def mark_all_notifications_read(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await db.execute(
        update(Notification).where(Notification.user_id == user.id, Notification.read.is_(False)).values(read=True)
    )
    await db.commit()
    return OkResponse(ok=True)


@router.post("/workspaces/{business_id}/notifications/{notification_id}/read", response_model=OkResponse)
async def mark_business_notification_read(
    business_id: str,
    notification_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "overview.view")
    row = await db.get(Notification, notification_id)
    if not row or row.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    row.read = True
    await db.commit()
    return OkResponse(ok=True)


@router.post("/workspaces/{business_id}/notifications/read-all", response_model=OkResponse)
async def mark_all_business_notifications_read(
    business_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "overview.view")
    await db.execute(
        update(Notification)
        .where(Notification.business_id == business_id, Notification.read.is_(False))
        .values(read=True)
    )
    await db.commit()
    return OkResponse(ok=True)


@router.post("/businesses/{business_id}/messages", response_model=OkResponse, status_code=status.HTTP_201_CREATED)
async def send_business_message(
    business_id: str,
    payload: BusinessMessageIn,
    request: Request,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    settings = get_settings()
    ip = client_ip_from_request(request)
    await auth_rate_limiter.check(
        f"biz-msg:{user.id}:{ip}",
        settings.auth_rate_limit_max_attempts,
        settings.auth_rate_limit_window_seconds,
    )
    business, _ = await ensure_business_visible(db, business_id, user)
    db.add(
        Notification(
            id=new_id("ntf"),
            user_id=business.owner_user_id,
            business_id=business.id,
            category="message",
            title="Customer message",
            body=payload.body.strip(),
            href="/workspace/customers",
        )
    )
    db.add(
        Notification(
            id=new_id("ntf"),
            user_id=user.id,
            business_id=business.id,
            category="message",
            title="Message sent",
            body=f"Sent to {business.name}.",
        )
    )
    await db.commit()
    return OkResponse(ok=True, message="Message sent")
