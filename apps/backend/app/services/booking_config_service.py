from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import BusinessBookingConfig
from app.models.business import Business

BOOKING_MODELS = ("appointment", "resource", "ticket", "capacity")
DEFAULT_LABELS = {
    "appointment": "Appointments",
    "resource": "Spaces & Resources",
    "ticket": "Events & Tickets",
    "capacity": "Classes & Group Experiences",
}


@dataclass(frozen=True)
class EffectiveBookingPolicy:
    booking_model: str
    enabled: bool
    approval_mode: str
    min_notice_minutes: int
    max_advance_days: int
    buffer_before_minutes: int
    buffer_after_minutes: int
    cancellation_cutoff_hours: int
    cancellation_fee_percent: int
    cancellation_policy_text: str
    deposit_mode: str
    deposit_value: float
    hold_ttl_minutes: int
    allow_overbooking: bool


async def list_booking_configs_for_business(db: AsyncSession, business_id: str) -> list[BusinessBookingConfig]:
    rows = list(
        (
            await db.execute(
                select(BusinessBookingConfig)
                .where(BusinessBookingConfig.business_id == business_id)
                .order_by(BusinessBookingConfig.booking_model.asc())
            )
        )
        .scalars()
        .all()
    )
    return rows


async def get_effective_booking_config(
    db: AsyncSession,
    *,
    business: Business,
    booking_model: str,
) -> EffectiveBookingPolicy:
    if booking_model not in BOOKING_MODELS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported booking model")

    cfg = (
        await db.execute(
            select(BusinessBookingConfig).where(
                BusinessBookingConfig.business_id == business.id,
                BusinessBookingConfig.booking_model == booking_model,
            )
        )
    ).scalar_one_or_none()

    if cfg:
        return EffectiveBookingPolicy(
            booking_model=cfg.booking_model,
            enabled=cfg.enabled,
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
        )

    # Backward-compatible default: appointments are enabled by default using Business columns;
    # non-appointment models require explicit config or created inventory/offerings.
    return EffectiveBookingPolicy(
        booking_model=booking_model,
        enabled=(booking_model == "appointment"),
        approval_mode=business.booking_approval if business.booking_approval in ("automatic", "manual") else "automatic",
        min_notice_minutes=max(0, business.min_notice_minutes),
        max_advance_days=max(1, business.max_advance_days),
        buffer_before_minutes=0,
        buffer_after_minutes=0,
        cancellation_cutoff_hours=24,
        cancellation_fee_percent=0,
        cancellation_policy_text=business.cancellation_policy,
        deposit_mode="none",
        deposit_value=0.0,
        hold_ttl_minutes=10,
        allow_overbooking=False,
    )


async def upsert_booking_config(
    db: AsyncSession,
    *,
    business: Business,
    booking_model: str,
    enabled: bool,
    display_label: str | None,
    approval_mode: str,
    min_notice_minutes: int,
    max_advance_days: int,
    buffer_before_minutes: int,
    buffer_after_minutes: int,
    cancellation_cutoff_hours: int,
    cancellation_fee_percent: int,
    cancellation_policy_text: str,
    deposit_mode: str,
    deposit_value: float,
    hold_ttl_minutes: int,
    allow_overbooking: bool,
    settings: dict,
) -> BusinessBookingConfig:
    if booking_model not in BOOKING_MODELS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid booking model")
    if deposit_mode == "percent" and deposit_value > 100:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Deposit percent cannot exceed 100")

    cfg = (
        await db.execute(
            select(BusinessBookingConfig)
            .where(
                BusinessBookingConfig.business_id == business.id,
                BusinessBookingConfig.booking_model == booking_model,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()

    if not cfg:
        cfg = BusinessBookingConfig(
            business_id=business.id,
            booking_model=booking_model,
        )
        db.add(cfg)

    cfg.enabled = enabled
    cfg.display_label = display_label.strip() if display_label and display_label.strip() else DEFAULT_LABELS[booking_model]
    cfg.approval_mode = approval_mode
    cfg.min_notice_minutes = min_notice_minutes
    cfg.max_advance_days = max_advance_days
    cfg.buffer_before_minutes = buffer_before_minutes
    cfg.buffer_after_minutes = buffer_after_minutes
    cfg.cancellation_cutoff_hours = cancellation_cutoff_hours
    cfg.cancellation_fee_percent = cancellation_fee_percent
    cfg.cancellation_policy_text = cancellation_policy_text.strip()
    cfg.deposit_mode = deposit_mode
    cfg.deposit_value = round(float(deposit_value), 2)
    cfg.hold_ttl_minutes = hold_ttl_minutes
    cfg.allow_overbooking = allow_overbooking
    cfg.settings = settings or {}

    if booking_model == "appointment":
        business.booking_approval = approval_mode
        business.min_notice_minutes = min_notice_minutes
        business.max_advance_days = max_advance_days
        business.cancellation_policy = cfg.cancellation_policy_text

    await db.commit()
    await db.refresh(cfg)
    return cfg


def compute_deposit_amount(
    *,
    total_amount: float,
    policy: EffectiveBookingPolicy,
    override_deposit: float | None = None,
) -> float:
    if total_amount <= 0:
        return 0.0
    if override_deposit is not None and override_deposit > 0:
        return round(min(total_amount, float(override_deposit)), 2)
    if policy.deposit_mode == "fixed":
        return round(min(total_amount, max(0.0, policy.deposit_value)), 2)
    if policy.deposit_mode == "percent":
        pct = min(100.0, max(0.0, policy.deposit_value))
        return round(total_amount * (pct / 100.0), 2)
    return 0.0


def compute_cancellation_cutoff(start_at: datetime | None, policy: EffectiveBookingPolicy) -> datetime | None:
    if not start_at:
        return None
    return start_at - timedelta(hours=max(0, policy.cancellation_cutoff_hours))
