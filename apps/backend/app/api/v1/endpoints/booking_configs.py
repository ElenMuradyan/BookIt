from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_optional_user, require_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.booking import (
    BookingModelLiteral,
    BusinessBookingConfigIn,
    BusinessBookingConfigOut,
)
from app.services.booking_config_service import (
    DEFAULT_LABELS,
    list_booking_configs_for_business,
    upsert_booking_config,
)
from app.services.rbac import ensure_business_visible, require_business_permission

router = APIRouter(tags=["booking-configs"])


def serialize_booking_config(cfg) -> BusinessBookingConfigOut:
    return BusinessBookingConfigOut(
        id=cfg.id,
        business_id=cfg.business_id,
        booking_model=cfg.booking_model,  # type: ignore[arg-type]
        enabled=cfg.enabled,
        display_label=cfg.display_label or DEFAULT_LABELS.get(cfg.booking_model),
        approval_mode=cfg.approval_mode,
        min_notice_minutes=cfg.min_notice_minutes,
        max_advance_days=cfg.max_advance_days,
        buffer_before_minutes=cfg.buffer_before_minutes,
        buffer_after_minutes=cfg.buffer_after_minutes,
        cancellation_cutoff_hours=cfg.cancellation_cutoff_hours,
        cancellation_fee_percent=cfg.cancellation_fee_percent,
        cancellation_policy_text=cfg.cancellation_policy_text,
        deposit_mode=cfg.deposit_mode,
        deposit_value=float(cfg.deposit_value),
        hold_ttl_minutes=cfg.hold_ttl_minutes,
        allow_overbooking=cfg.allow_overbooking,
        settings=cfg.settings or {},
    )


@router.get("/businesses/{business_id}/booking-configs", response_model=list[BusinessBookingConfigOut])
async def list_business_booking_configs(
    business_id: str,
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, is_member = await ensure_business_visible(db, business_id, user)
    rows = await list_booking_configs_for_business(db, business.id)
    if not rows:
        return [
            BusinessBookingConfigOut(
                id=f"bcfg_default_{business.id}",
                business_id=business.id,
                booking_model="appointment",
                enabled=True,
                display_label="Appointments",
                approval_mode=business.booking_approval,
                min_notice_minutes=business.min_notice_minutes,
                max_advance_days=business.max_advance_days,
                buffer_before_minutes=0,
                buffer_after_minutes=0,
                cancellation_cutoff_hours=24,
                cancellation_fee_percent=0,
                cancellation_policy_text=business.cancellation_policy,
                deposit_mode="none",
                deposit_value=0.0,
                hold_ttl_minutes=10,
                allow_overbooking=False,
                settings={},
            )
        ]
    visible = rows if is_member else [r for r in rows if r.enabled]
    return [serialize_booking_config(r) for r in visible]


@router.put("/businesses/{business_id}/booking-configs/{booking_model}", response_model=BusinessBookingConfigOut)
async def upsert_business_booking_config(
    business_id: str,
    booking_model: BookingModelLiteral,
    payload: BusinessBookingConfigIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    business, _ = await require_business_permission(db, user, business_id, "settings.policies")
    cfg = await upsert_booking_config(
        db,
        business=business,
        booking_model=booking_model,
        enabled=payload.enabled,
        display_label=payload.display_label,
        approval_mode=payload.approval_mode,
        min_notice_minutes=payload.min_notice_minutes,
        max_advance_days=payload.max_advance_days,
        buffer_before_minutes=payload.buffer_before_minutes,
        buffer_after_minutes=payload.buffer_after_minutes,
        cancellation_cutoff_hours=payload.cancellation_cutoff_hours,
        cancellation_fee_percent=payload.cancellation_fee_percent,
        cancellation_policy_text=payload.cancellation_policy_text,
        deposit_mode=payload.deposit_mode,
        deposit_value=payload.deposit_value,
        hold_ttl_minutes=payload.hold_ttl_minutes,
        allow_overbooking=payload.allow_overbooking,
        settings=payload.settings,
    )
    return serialize_booking_config(cfg)
