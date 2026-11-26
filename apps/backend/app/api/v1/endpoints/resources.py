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
    HotelStayAvailabilityOut,
    HotelStayOptionOut,
    ResourceAvailabilityOut,
    ResourceAvailabilitySlotOut,
    ResourceBlockIn,
    ResourceBlockOut,
    ResourceIn,
    ResourceOut,
    ResourceSearchItemOut,
    ResourceUpdateIn,
)
from app.schemas.common import OkResponse
from app.services.rbac import (
    ensure_business_visible,
    get_active_membership,
    has_permission,
    require_business_permission,
)
from app.services.resource_service import compute_resource_availability, search_hotel_stays_availability

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

    can_view_inactive = False

    if include_inactive and user:
        if user.is_platform_admin or business.owner_user_id == user.id:
            can_view_inactive = True
        else:
            membership = await get_active_membership(db, user.id, business.id)
            can_view_inactive = bool(
                membership and has_permission(membership.role, "resources.manage")
            )

    if not can_view_inactive:
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

    data = payload.model_dump(exclude_unset=True)
    new_min = data.get("min_duration_minutes", res.min_duration_minutes)
    new_max = data.get("max_duration_minutes", res.max_duration_minutes)
    if new_max is not None and new_min is not None and new_max < new_min:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="maxDurationMinutes must be >= minDurationMinutes",
        )
    for field_name, value in data.items():
        setattr(res, field_name, value)
    await db.commit()
    await db.refresh(res)
    return serialize_resource(res)


@router.get("/businesses/{business_id}/resources/search", response_model=list[ResourceSearchItemOut])
async def search_resources_availability(
    business_id: str,
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    date: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"),
    time: str | None = Query(default=None, pattern=r"^\d{2}:\d{2}$"),
    guests: int = Query(default=1, ge=1, le=500),
    area: str | None = Query(default=None),
    resource_type: str | None = Query(default=None, alias="resourceType"),
):
    business, _ = await ensure_business_visible(db, business_id, user)
    stmt = select(Resource).where(
        Resource.business_id == business.id,
        Resource.active.is_(True),
        Resource.capacity_people >= guests,
    )
    if resource_type:
        stmt = stmt.where(Resource.resource_type == resource_type)
    stmt = stmt.order_by(Resource.capacity_people.asc(), Resource.name.asc())
    resources = list((await db.execute(stmt)).scalars().all())

    results: list[ResourceSearchItemOut] = []
    area_clean = area.strip().lower() if area and area.strip() else None
    for res in resources:
        if area_clean:
            res_area = str((res.attributes or {}).get("area") or "").strip().lower()
            if res_area != area_clean:
                continue
        slots = await compute_resource_availability(db, business=business, resource=res, date_str=date)
        matches_time = any(s["time"] == time for s in slots) if time else None
        results.append(
            ResourceSearchItemOut(
                resource=serialize_resource(res),
                date=date,
                timezone=res.timezone or business.timezone,
                available_at_requested_time=matches_time,
                slots=[ResourceAvailabilitySlotOut(**s) for s in slots],
            )
        )
    return results


@router.get("/businesses/{business_id}/stays/availability", response_model=HotelStayAvailabilityOut)
async def get_hotel_stays_availability(
    business_id: str,
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    check_in: str = Query(alias="checkIn", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    check_out: str = Query(alias="checkOut", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    guests: int = Query(default=1, ge=1, le=100),
    room_type: str | None = Query(default=None, alias="roomType"),
):
    business, _ = await ensure_business_visible(db, business_id, user)
    data = await search_hotel_stays_availability(
        db,
        business=business,
        check_in_date=check_in,
        check_out_date=check_out,
        guests=guests,
        room_type=room_type,
    )
    return HotelStayAvailabilityOut(
        business_id=data["business_id"],
        check_in=data["check_in"],
        check_out=data["check_out"],
        check_in_time=data["check_in_time"],
        check_out_time=data["check_out_time"],
        nights=data["nights"],
        guests=data["guests"],
        timezone=data["timezone"],
        options=[
            HotelStayOptionOut(
                resource=serialize_resource(opt["resource"]),
                check_in_at=opt["check_in_at"],
                check_out_at=opt["check_out_at"],
                nights=opt["nights"],
                remaining_units=opt["remaining_units"],
                nightly_rate=opt["nightly_rate"],
                total_price=opt["total_price"],
                deposit_due=opt["deposit_due"],
            )
            for opt in data["options"]
        ],
    )


@router.get("/businesses/{business_id}/resource-blocks", response_model=list[ResourceBlockOut])
async def list_resource_blocks(
    business_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    resource_id: str | None = Query(default=None, alias="resourceId"),
):
    await require_business_permission(db, user, business_id, "resources.manage")
    stmt = (
        select(ResourceBlock)
        .join(Resource, Resource.id == ResourceBlock.resource_id)
        .where(Resource.business_id == business_id)
    )
    if resource_id:
        stmt = stmt.where(ResourceBlock.resource_id == resource_id)
    stmt = stmt.order_by(ResourceBlock.start_at.asc())
    rows = (await db.execute(stmt)).scalars().all()
    return [ResourceBlockOut.model_validate(b) for b in rows]


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


@router.delete("/businesses/{business_id}/resources/{resource_id}/blocks/{block_id}", response_model=OkResponse)
async def delete_resource_block(
    business_id: str,
    resource_id: str,
    block_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "resources.manage")
    blk = (
        await db.execute(
            select(ResourceBlock)
            .join(Resource, Resource.id == ResourceBlock.resource_id)
            .where(
                ResourceBlock.id == block_id,
                ResourceBlock.resource_id == resource_id,
                Resource.business_id == business_id,
            )
        )
    ).scalar_one_or_none()
    if not blk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource block not found")
    await db.delete(blk)
    await db.commit()
    return OkResponse(ok=True, message="Resource block removed")


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
