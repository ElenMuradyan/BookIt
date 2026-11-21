"""Idempotent Phase 2 backfill and parity verification utility.

Run after Alembic migrations:
  python3 -m scripts.backfill_phase2 --verify-only
  python3 -m scripts.backfill_phase2
"""

import argparse
import asyncio
import hashlib
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session_factory
from app.models.booking import (
    Appointment,
    AppointmentStatusHistory,
    Booking,
    BookingStatusHistory,
    BusinessBookingConfig,
)
from app.models.business import Business
from app.models.catalog import Service
from app.models.engagement import Review


def deterministic_booking_id(appointment_id: str) -> str:
    return f"bk_m_{hashlib.md5(appointment_id.encode('utf-8')).hexdigest()}"


def deterministic_history_id(history_id: str) -> str:
    return f"bsh_m_{hashlib.md5(history_id.encode('utf-8')).hexdigest()}"


def deterministic_config_id(business_id: str, model: str) -> str:
    return f"bcfg_{hashlib.md5(f'{business_id}:{model}'.encode('utf-8')).hexdigest()}"


async def backfill_phase2_records(session: AsyncSession, *, commit: bool = True) -> dict[str, int]:
    created_configs = 0
    created_bookings = 0
    created_histories = 0
    linked_reviews = 0

    businesses = list((await session.execute(select(Business))).scalars().all())
    for biz in businesses:
        existing_cfg = (
            await session.execute(
                select(BusinessBookingConfig).where(
                    BusinessBookingConfig.business_id == biz.id,
                    BusinessBookingConfig.booking_model == "appointment",
                )
            )
        ).scalar_one_or_none()
        if not existing_cfg:
            session.add(
                BusinessBookingConfig(
                    id=deterministic_config_id(biz.id, "appointment"),
                    business_id=biz.id,
                    booking_model="appointment",
                    enabled=True,
                    display_label="Appointments",
                    approval_mode=biz.booking_approval if biz.booking_approval in ("automatic", "manual") else "automatic",
                    min_notice_minutes=max(0, biz.min_notice_minutes),
                    max_advance_days=max(1, biz.max_advance_days),
                    cancellation_cutoff_hours=24,
                    cancellation_fee_percent=0,
                    cancellation_policy_text=biz.cancellation_policy,
                    deposit_mode="none",
                    deposit_value=0,
                    hold_ttl_minutes=10,
                    allow_overbooking=False,
                    settings={},
                )
            )
            created_configs += 1

    await session.flush()

    appts = list((await session.execute(select(Appointment).where(Appointment.booking_id.is_(None)))).scalars().all())
    pending_links: list[tuple[Appointment, str]] = []
    for appt in appts:
        bk_id = deterministic_booking_id(appt.id)
        existing_bk = await session.get(Booking, bk_id)
        if not existing_bk:
            biz = await session.get(Business, appt.business_id)
            svc = await session.get(Service, appt.service_id)
            session.add(
                Booking(
                    id=bk_id,
                    business_id=appt.business_id,
                    customer_id=appt.customer_id,
                    booking_model="appointment",
                    title_snapshot=svc.name if svc else "Appointment",
                    start_at=appt.start_at,
                    end_at=appt.end_at,
                    timezone=biz.timezone if biz else "America/Los_Angeles",
                    quantity=1,
                    status=appt.status,
                    confirmation_mode=appt.confirmation_mode,
                    subtotal_amount=float(appt.price),
                    discount_amount=0,
                    tax_amount=0,
                    total_amount=float(appt.price),
                    deposit_due_amount=float(svc.deposit_amount) if svc and svc.deposit_amount is not None else 0,
                    amount_paid=float(appt.price) if appt.payment_status == "paid" else 0,
                    refunded_amount=float(appt.price) if appt.payment_status == "refunded" else 0,
                    currency=appt.currency,
                    payment_status=appt.payment_status,
                    payment_method=appt.payment_method,
                    cancellation_cutoff_at=appt.start_at - timedelta(hours=24),
                    cancellation_policy_snapshot=(
                        svc.cancellation_policy
                        if svc and svc.cancellation_policy
                        else (biz.cancellation_policy if biz else "Free cancellation up to 24 hours before the visit.")
                    ),
                    notes=appt.notes,
                    metadata_json={
                        "legacyAppointmentId": appt.id,
                        "serviceId": appt.service_id,
                        "employeeId": appt.employee_id,
                    },
                    hold_expires_at=None,
                    idempotency_key=appt.idempotency_key,
                    check_in_code=appt.check_in_code,
                    checked_in_at=appt.checked_in_at,
                )
            )
            created_bookings += 1

        pending_links.append((appt, bk_id))

    # Flush Booking inserts before setting appointments.booking_id so PostgreSQL
    # always sees the target Booking row regardless of SQLAlchemy UOW ordering.
    await session.flush()

    for appt, bk_id in pending_links:
        appt.booking_id = bk_id

    await session.flush()

    histories = list((await session.execute(select(AppointmentStatusHistory))).scalars().all())
    for h in histories:
        bsh_id = deterministic_history_id(h.id)
        if await session.get(BookingStatusHistory, bsh_id):
            continue
        appt = await session.get(Appointment, h.appointment_id)
        if appt and appt.booking_id:
            session.add(
                BookingStatusHistory(
                    id=bsh_id,
                    booking_id=appt.booking_id,
                    from_status=h.from_status,
                    to_status=h.to_status,
                    changed_by_user_id=h.changed_by_user_id,
                    reason=h.reason,
                    changed_at=h.changed_at,
                )
            )
            created_histories += 1

    reviews = list(
        (
            await session.execute(
                select(Review).where(Review.appointment_id.is_not(None), Review.booking_id.is_(None))
            )
        ).scalars().all()
    )
    for rev in reviews:
        if rev.appointment_id:
            appt = await session.get(Appointment, rev.appointment_id)
            if appt and appt.booking_id:
                rev.booking_id = appt.booking_id
                linked_reviews += 1

    if commit:
        await session.commit()
    else:
        await session.flush()
    return {
        "created_configs": created_configs,
        "created_bookings": created_bookings,
        "created_histories": created_histories,
        "linked_reviews": linked_reviews,
    }


async def verify_phase2_parity(session: AsyncSession) -> dict[str, object]:
    appt_count = int((await session.execute(select(func.count(Appointment.id)))).scalar_one())
    unlinked_appts = int(
        (await session.execute(select(func.count(Appointment.id)).where(Appointment.booking_id.is_(None)))).scalar_one()
    )
    bk_appt_count = int(
        (
            await session.execute(
                select(func.count(Booking.id)).where(Booking.booking_model == "appointment")
            )
        ).scalar_one()
    )
    appt_sum = float((await session.execute(select(func.coalesce(func.sum(Appointment.price), 0)))).scalar_one())
    bk_appt_sum = float(
        (
            await session.execute(
                select(func.coalesce(func.sum(Booking.total_amount), 0)).where(Booking.booking_model == "appointment")
            )
        ).scalar_one()
    )

    fk_ondelete = Appointment.__table__.c.booking_id.foreign_keys
    cascade_present = any(fk.ondelete and fk.ondelete.upper() == "CASCADE" for fk in fk_ondelete)

    return {
        "appointments_total": appt_count,
        "appointments_unlinked": unlinked_appts,
        "bookings_appointment_total": bk_appt_count,
        "appointment_price_sum": appt_sum,
        "booking_total_sum": bk_appt_sum,
        "count_parity": appt_count == bk_appt_count and unlinked_appts == 0,
        "amount_parity": abs(appt_sum - bk_appt_sum) < 0.01,
        "safe_non_cascade_fk": not cascade_present,
    }


async def _main(verify_only: bool) -> None:
    factory = get_session_factory()
    async with factory() as session:
        if not verify_only:
            result = await backfill_phase2_records(session)
            print("Backfill summary:", result)
        parity = await verify_phase2_parity(session)
        print("Parity check:", parity)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill and verify BookIt Phase 2 universal booking records.")
    parser.add_argument("--verify-only", action="store_true", help="Only report parity without writing.")
    args = parser.parse_args()
    asyncio.run(_main(args.verify_only))
