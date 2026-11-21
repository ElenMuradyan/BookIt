from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_optional_user, require_user
from app.core.database import get_db
from app.models.base import new_id
from app.models.booking import Resource, ResourceBlock
from app.models.user import User
from app.schemas.booking import (
    ResourceAvailabilityOut,
    ResourceAvailabilitySlotOut,
    ResourceBlockIn,
    ResourceBlockOut,
    ResourceIn,
    ResourceOut,
    ResourceUpdateIn,
)
from app.services.rbac import ensure_business_visible, require_business_permission
from app.services.resource_service import compute_resource_availability

router = APIRouter(tags=["resources"])


def serialize_resource(r: Resource) -> ResourceOut:
    return ResourceOut(
        id=r.id,
        business_id=r.business_id,
        name=r.name,
        resource_type=r.resource_type,
        description=r.description,
        capacity_people=r.capacity_people,
        units_total=r.units_total,
        pricing_unit=r.pricing_unit,
        slot_duration_minutes=r.slot_duration_minutes,
        min_duration_minutes=r.min_duration_minutes,
        max_duration_minutes=r.max_duration_minutes,
        buffer_minutes=r.buffer_minutes,
        base_price=float(r.base_price),
        currency=r.currency,
        deposit_amount=float(r.deposit_amount) if r.deposit_amount is not None else None,
        schedule_hours=r.schedule_hours,
        timezone=r.timezone,
        attributes=r.attributes or {},
        image_url=r.image_url,
        active=r.active,
    )


@router.get("/businesses/{business_id}/resources", response_model=list[ResourceOut])
async def list_resources(
    business_id: str,
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    resource_type: str | None = Query(default=None, alias="resourceType"),
    include_inactive: bool = Query(default=False, alias="includeInactive"),
):
    business, is_member = await ensure_business_visible(db, business_id, user)
    stmt = select(Resource).where(Resource.business_id == business.id)
    if not (include_inactive and is_member):
        stmt = stmt.where(Resource.active.is_(True))
    if resource_type:
        stmt = stmt.where(Resource.resource_type == resource_type)
    stmt = stmt.order_by(Resource.name.asc())
    rows = (await db.execute(stmt)).scalars().all()
    return [serialize_resource(r) for r in rows]


@router.post("/businesses/{business_id}/resources", response_model=ResourceOut, status_code=status.HTTP_201_CREATED)
async def create_resource(
    business_id: str,
    payload: ResourceIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, _ = await require_business_permission(db, user, business_id, "resources.manage")
    if payload.max_duration_minutes and payload.max_duration_minutes < payload.min_duration_minutes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="maxDurationMinutes must be >= minDurationMinutes",
        )
    res = Resource(
        id=new_id("res"),
        business_id=business.id,
        name=payload.name.strip(),
        resource_type=payload.resource_type,
        description=payload.description.strip(),
        capacity_people=payload.capacity_people,
        units_total=payload.units_total,
        pricing_unit=payload.pricing_unit,
        slot_duration_minutes=payload.slot_duration_minutes,
        min_duration_minutes=payload.min_duration_minutes,
        max_duration_minutes=payload.max_duration_minutes,
        buffer_minutes=payload.buffer_minutes,
        base_price=payload.base_price,
        currency=payload.currency.upper(),
        deposit_amount=payload.deposit_amount,
        schedule_hours=payload.schedule_hours,
        timezone=payload.timezone,
        attributes=payload.attributes,
        image_url=payload.image_url,
        active=payload.active,
    )
    db.add(res)
    await db.commit()
    await db.refresh(res)
    return serialize_resource(res)


@router.patch("/businesses/{business_id}/resources/{resource_id}", response_model=ResourceOut)
async def update_resource(
    business_id: str,
    resource_id: str,
    payload: ResourceUpdateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "resources.manage")
    res = await db.get(Resource, resource_id)
    if not res or res.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")

    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(res, field_name, value)
    await db.commit()
    await db.refresh(res)
    return serialize_resource(res)


@router.post(
    "/businesses/{business_id}/resources/{resource_id}/blocks",
    response_model=ResourceBlockOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_resource_block(
    business_id: str,
    resource_id: str,
    payload: ResourceBlockIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "resources.manage")
    res = await db.get(Resource, resource_id)
    if not res or res.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
    if payload.end_at <= payload.start_at:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="endAt must be after startAt")
    if payload.units_blocked > res.units_total:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="unitsBlocked exceeds unitsTotal")

    blk = ResourceBlock(
        id=new_id("rblk"),
        resource_id=res.id,
        start_at=payload.start_at,
        end_at=payload.end_at,
        units_blocked=payload.units_blocked,
        reason=payload.reason.strip(),
        created_by_user_id=user.id,
    )
    db.add(blk)
    await db.commit()
    await db.refresh(blk)
    return ResourceBlockOut.model_validate(blk)


@router.get("/businesses/{business_id}/resources/{resource_id}/availability", response_model=ResourceAvailabilityOut)
async def get_resource_availability(
    business_id: str,
    resource_id: str,
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    date: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    business, _ = await ensure_business_visible(db, business_id, user)
    res = await db.get(Resource, resource_id)
    if not res or res.business_id != business.id or not res.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")

    slots = await compute_resource_availability(db, business=business, resource=res, date_str=date)
    return ResourceAvailabilityOut(
        business_id=business.id,
        resource_id=res.id,
        date=date,
        timezone=res.timezone or business.timezone,
        units_total=res.units_total,
        slots=[ResourceAvailabilitySlotOut(**s) for s in slots],
    )
