from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies.auth import get_optional_user, require_user
from app.core.database import get_db
from app.models.base import new_id
from app.models.booking import Appointment
from app.models.business import Business
from app.models.catalog import Employee, Service
from app.models.user import User
from app.schemas.catalog import ServiceActiveIn, ServiceIn, ServiceOut, ServiceUpdateIn
from app.schemas.common import OkResponse
from app.services.rbac import ensure_business_visible, require_business_permission

router = APIRouter(tags=["services"])


async def _resolve_business_employees(
    db: AsyncSession,
    business_id: str,
    employee_ids: list[str] | None,
) -> list[Employee]:
    if not employee_ids:
        return []
    cleaned = list(dict.fromkeys(eid.strip() for eid in employee_ids if eid.strip()))
    if not cleaned:
        return []
    rows = list(
        (
            await db.execute(
                select(Employee).where(Employee.business_id == business_id, Employee.id.in_(cleaned))
            )
        )
        .scalars()
        .all()
    )
    if len(rows) != len(cleaned):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="One or more selected staff members do not belong to this business",
        )
    return rows


def _serialize_service(s: Service) -> ServiceOut:
    return ServiceOut(
        id=s.id,
        business_id=s.business_id,
        name=s.name,
        description=s.description,
        category=s.category,
        price=float(s.price),
        currency=s.currency,
        duration_minutes=s.duration_minutes,
        image_url=s.image_url,
        employee_ids=[e.id for e in s.employees],
        active=s.active,
        deposit_amount=float(s.deposit_amount) if s.deposit_amount is not None else None,
        requires_approval=s.requires_approval,
        cancellation_policy=s.cancellation_policy,
    )


@router.get("/services", response_model=list[ServiceOut])
async def search_services(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str | None = None,
    category: str | None = None,
    min_price: float | None = Query(default=None, ge=0),
    max_price: float | None = Query(default=None, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    stmt = (
        select(Service)
        .join(Business, Business.id == Service.business_id)
        .options(selectinload(Service.employees))
        .where(Business.is_public.is_(True), Business.status == "approved", Service.active.is_(True))
    )
    if category:
        stmt = stmt.where(Business.category == category)
    if min_price is not None:
        stmt = stmt.where(Service.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Service.price <= max_price)
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                Service.name.ilike(like),
                Service.description.ilike(like),
                Service.category.ilike(like),
                Business.name.ilike(like),
            )
        )
    rows = (await db.execute(stmt.offset(offset).limit(limit))).scalars().all()
    return [_serialize_service(r) for r in rows]


@router.get("/services/{service_id}", response_model=ServiceOut)
async def get_service(
    service_id: str,
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    service = (
        await db.execute(select(Service).options(selectinload(Service.employees)).where(Service.id == service_id))
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    _, is_member = await ensure_business_visible(db, service.business_id, user)
    if not is_member and not service.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    return _serialize_service(service)


@router.post("/workspaces/{business_id}/services", response_model=ServiceOut, status_code=status.HTTP_201_CREATED)
async def create_service(
    business_id: str,
    payload: ServiceIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "services.manage")
    assigned_employees = await _resolve_business_employees(db, business_id, payload.employee_ids)
    service = Service(
        id=new_id("svc"),
        business_id=business_id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        category=payload.category.strip(),
        price=payload.price,
        currency="USD",
        duration_minutes=payload.duration_minutes,
        image_url=payload.image_url,
        active=True,
        deposit_amount=payload.deposit_amount,
        requires_approval=payload.requires_approval,
        cancellation_policy=payload.cancellation_policy.strip(),
        employees=assigned_employees,
    )
    db.add(service)
    await db.commit()
    loaded = (
        await db.execute(select(Service).options(selectinload(Service.employees)).where(Service.id == service.id))
    ).scalar_one()
    return _serialize_service(loaded)


@router.put("/workspaces/{business_id}/services/{service_id}", response_model=ServiceOut)
async def update_service(
    business_id: str,
    service_id: str,
    payload: ServiceIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "services.manage")
    service = (
        await db.execute(
            select(Service)
            .options(selectinload(Service.employees))
            .where(Service.id == service_id, Service.business_id == business_id)
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

    service.name = payload.name.strip()
    service.description = payload.description.strip()
    service.category = payload.category.strip()
    service.price = payload.price
    service.duration_minutes = payload.duration_minutes
    service.cancellation_policy = payload.cancellation_policy.strip()
    if payload.image_url is not None:
        service.image_url = payload.image_url
    service.requires_approval = payload.requires_approval
    service.deposit_amount = payload.deposit_amount
    if payload.employee_ids is not None:
        service.employees = await _resolve_business_employees(db, business_id, payload.employee_ids)
    await db.commit()
    loaded = (
        await db.execute(select(Service).options(selectinload(Service.employees)).where(Service.id == service.id))
    ).scalar_one()
    return _serialize_service(loaded)


@router.patch("/workspaces/{business_id}/services/{service_id}", response_model=ServiceOut)
async def patch_service(
    business_id: str,
    service_id: str,
    payload: ServiceUpdateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "services.manage")
    service = (
        await db.execute(
            select(Service)
            .options(selectinload(Service.employees))
            .where(Service.id == service_id, Service.business_id == business_id)
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

    data = payload.model_dump(exclude_unset=True)
    employee_ids = data.pop("employee_ids", None)
    for field_name, value in data.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(service, field_name, value)
    if employee_ids is not None:
        service.employees = await _resolve_business_employees(db, business_id, employee_ids)
    await db.commit()
    loaded = (
        await db.execute(select(Service).options(selectinload(Service.employees)).where(Service.id == service.id))
    ).scalar_one()
    return _serialize_service(loaded)


@router.delete("/workspaces/{business_id}/services/{service_id}", response_model=OkResponse)
async def delete_service(
    business_id: str,
    service_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "services.manage")
    service = (
        await db.execute(select(Service).where(Service.id == service_id, Service.business_id == business_id))
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

    appt_count = int(
        (await db.execute(select(func.count(Appointment.id)).where(Appointment.service_id == service.id))).scalar_one()
    )
    if appt_count > 0:
        service.active = False
        await db.commit()
        return OkResponse(ok=True, message="Service archived because existing appointments reference it")

    await db.delete(service)
    await db.commit()
    return OkResponse(ok=True, message="Service deleted")


@router.patch("/workspaces/{business_id}/services/{service_id}/active", response_model=ServiceOut)
async def set_service_active(
    business_id: str,
    service_id: str,
    payload: ServiceActiveIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "services.manage")
    service = (
        await db.execute(
            select(Service)
            .options(selectinload(Service.employees))
            .where(Service.id == service_id, Service.business_id == business_id)
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    service.active = payload.active
    await db.commit()
    return _serialize_service(service)


@router.post("/workspaces/{business_id}/services/{service_id}/employees/{employee_id}/toggle", response_model=ServiceOut)
async def toggle_employee_on_service(
    business_id: str,
    service_id: str,
    employee_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "services.manage")
    service = (
        await db.execute(
            select(Service)
            .options(selectinload(Service.employees))
            .where(Service.id == service_id, Service.business_id == business_id)
        )
    ).scalar_one_or_none()
    employee = (
        await db.execute(select(Employee).where(Employee.id == employee_id, Employee.business_id == business_id))
    ).scalar_one_or_none()
    if not service or not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service or employee not found")

    if any(e.id == employee.id for e in service.employees):
        service.employees = [e for e in service.employees if e.id != employee.id]
    else:
        service.employees.append(employee)
    await db.commit()
    await db.refresh(service)
    return _serialize_service(service)
