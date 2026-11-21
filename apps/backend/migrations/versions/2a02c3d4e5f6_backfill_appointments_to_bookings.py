"""backfill appointments and business booking configs into universal bookings

Revision ID: 2a02c3d4e5f6
Revises: 2a01b2c3d4e5
Create Date: 2026-11-21 06:41:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2a02c3d4e5f6"
down_revision: Union[str, None] = "2a01b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Seed default appointment booking config for every existing business
    op.execute(
        """
        INSERT INTO business_booking_configs (
            id, business_id, booking_model, enabled, display_label,
            approval_mode, min_notice_minutes, max_advance_days,
            buffer_before_minutes, buffer_after_minutes,
            cancellation_cutoff_hours, cancellation_fee_percent, cancellation_policy_text,
            deposit_mode, deposit_value, hold_ttl_minutes, allow_overbooking, settings,
            created_at, updated_at
        )
        SELECT
            'bcfg_' || md5(b.id || chr(58) || 'appointment'),
            b.id,
            'appointment',
            true,
            'Appointments',
            CASE WHEN b.booking_approval IN ('automatic', 'manual') THEN b.booking_approval ELSE 'automatic' END,
            GREATEST(0, COALESCE(b.min_notice_minutes, 30)),
            GREATEST(1, COALESCE(b.max_advance_days, 90)),
            0,
            0,
            24,
            0,
            COALESCE(NULLIF(b.cancellation_policy, ''), 'Free cancellation up to 24 hours before the appointment.'),
            'none',
            0,
            10,
            false,
            '{}'::jsonb,
            b.created_at,
            b.updated_at
        FROM businesses b
        WHERE NOT EXISTS (
            SELECT 1 FROM business_booking_configs c
            WHERE c.business_id = b.id AND c.booking_model = 'appointment'
        );
        """
    )

    # 2. Idempotently create a linked universal Booking row for each legacy Appointment row
    op.execute(
        """
        INSERT INTO bookings (
            id, business_id, customer_id, booking_model, title_snapshot,
            start_at, end_at, timezone, quantity, status, confirmation_mode,
            subtotal_amount, discount_amount, tax_amount, total_amount,
            deposit_due_amount, amount_paid, refunded_amount, currency,
            payment_status, payment_method, cancellation_cutoff_at,
            cancellation_policy_snapshot, notes, metadata_json,
            hold_expires_at, idempotency_key, check_in_code, checked_in_at,
            created_at, updated_at
        )
        SELECT
            'bk_m_' || md5(a.id),
            a.business_id,
            a.customer_id,
            'appointment',
            COALESCE(s.name, 'Appointment'),
            a.start_at,
            a.end_at,
            COALESCE(b.timezone, 'America/Los_Angeles'),
            1,
            a.status,
            a.confirmation_mode,
            a.price,
            0,
            0,
            a.price,
            COALESCE(s.deposit_amount, 0),
            CASE WHEN a.payment_status = 'paid' THEN a.price ELSE 0 END,
            CASE WHEN a.payment_status = 'refunded' THEN a.price ELSE 0 END,
            a.currency,
            a.payment_status,
            a.payment_method,
            a.start_at - interval '24 hours',
            COALESCE(NULLIF(s.cancellation_policy, ''), COALESCE(b.cancellation_policy, 'Free cancellation up to 24 hours before the visit.')),
            a.notes,
            jsonb_build_object(
                'legacyAppointmentId', a.id,
                'serviceId', a.service_id,
                'employeeId', a.employee_id
            ),
            NULL,
            a.idempotency_key,
            a.check_in_code,
            a.checked_in_at,
            a.created_at,
            a.created_at
        FROM appointments a
        JOIN businesses b ON b.id = a.business_id
        LEFT JOIN services s ON s.id = a.service_id
        WHERE a.booking_id IS NULL
        ON CONFLICT (id) DO NOTHING;
        """
    )

    # 3. Link appointments.booking_id to the backfilled bookings row
    op.execute(
        """
        UPDATE appointments
        SET booking_id = 'bk_m_' || md5(id)
        WHERE booking_id IS NULL
          AND EXISTS (SELECT 1 FROM bookings bk WHERE bk.id = 'bk_m_' || md5(appointments.id));
        """
    )

    # 4. Copy appointment status history into booking_status_history
    op.execute(
        """
        INSERT INTO booking_status_history (
            id, booking_id, from_status, to_status, changed_by_user_id, reason, changed_at
        )
        SELECT
            'bsh_m_' || md5(h.id),
            a.booking_id,
            h.from_status,
            h.to_status,
            h.changed_by_user_id,
            h.reason,
            h.changed_at
        FROM appointment_status_history h
        JOIN appointments a ON a.id = h.appointment_id
        WHERE a.booking_id IS NOT NULL
        ON CONFLICT (id) DO NOTHING;
        """
    )

    # 5. Populate reviews.booking_id from linked appointments
    op.execute(
        """
        UPDATE reviews r
        SET booking_id = a.booking_id
        FROM appointments a
        WHERE r.appointment_id = a.id
          AND r.booking_id IS NULL
          AND a.booking_id IS NOT NULL;
        """
    )


def downgrade() -> None:
    # Preserve all appointments and reviews; only remove backfilled Phase 2 links and records.
    op.execute("UPDATE reviews SET booking_id = NULL WHERE booking_id LIKE 'bk_m_%'")
    op.execute("UPDATE appointments SET booking_id = NULL WHERE booking_id LIKE 'bk_m_%'")
    op.execute("DELETE FROM booking_status_history WHERE id LIKE 'bsh_m_%'")
    op.execute("DELETE FROM bookings WHERE id LIKE 'bk_m_%'")
    op.execute("DELETE FROM business_booking_configs WHERE id LIKE 'bcfg_%'")
