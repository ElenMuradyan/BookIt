from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_optional_user
from app.core.database import get_db
from app.models.catalog import Service
from app.models.user import User
from app.schemas.booking import AvailabilityOut, AvailabilitySlotOut
from app.services.booking_service import load_availability_for_service
from app.services.rbac import ensure_business_visible

router = APIRouter(tags=["availability"])


@router.get("/businesses/{business_id}/availability", response_model=AvailabilityOut)
async def get_business_availability(
    business_id: str,
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    service_id: str = Query(alias="serviceId"),
    date: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"),
    employee_id: str | None = Query(default=None, alias="employeeId"),
    enforce_notice: bool = Query(default=True, alias="enforceNotice"),
):
    business, _ = await ensure_business_visible(db, business_id, user)
    service = await db.get(Service, service_id)
    if not service or service.business_id != business.id or not service.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

    computed = await load_availability_for_service(
        db,
        business=business,
        service=service,
        date_str=date,
        employee_id=employee_id,
        enforce_advance_window=enforce_notice,
    )
    return AvailabilityOut(
        business_id=business.id,
        service_id=service.id,
        date=date,
        timezone=business.timezone,
        slots=[s.time_label for s in computed],
        details=[
            AvailabilitySlotOut(
                time=s.time_label,
                start_at=s.start_at,
                end_at=s.end_at,
                employee_ids=s.employee_ids,
            )
            for s in computed
        ],
    )
