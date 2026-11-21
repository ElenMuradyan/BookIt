"""phase 2 universal booking foundation

Revision ID: 2a01b2c3d4e5
Revises: cee0e1f2b63c
Create Date: 2026-11-21 06:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "2a01b2c3d4e5"
down_revision: Union[str, None] = "cee0e1f2b63c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    op.create_table(
        "business_booking_configs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("business_id", sa.String(length=64), nullable=False),
        sa.Column("booking_model", sa.String(length=32), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("display_label", sa.String(length=80), nullable=True),
        sa.Column("approval_mode", sa.String(length=32), nullable=False),
        sa.Column("min_notice_minutes", sa.Integer(), nullable=False),
        sa.Column("max_advance_days", sa.Integer(), nullable=False),
        sa.Column("buffer_before_minutes", sa.Integer(), nullable=False),
        sa.Column("buffer_after_minutes", sa.Integer(), nullable=False),
        sa.Column("cancellation_cutoff_hours", sa.Integer(), nullable=False),
        sa.Column("cancellation_fee_percent", sa.Integer(), nullable=False),
        sa.Column("cancellation_policy_text", sa.Text(), nullable=False),
        sa.Column("deposit_mode", sa.String(length=32), nullable=False),
        sa.Column("deposit_value", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("hold_ttl_minutes", sa.Integer(), nullable=False),
        sa.Column("allow_overbooking", sa.Boolean(), nullable=False),
        sa.Column("settings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "booking_model IN ('appointment', 'resource', 'ticket', 'capacity')",
            name="ck_bcfg_booking_model",
        ),
        sa.CheckConstraint("approval_mode IN ('automatic', 'manual')", name="ck_bcfg_approval_mode"),
        sa.CheckConstraint("deposit_mode IN ('none', 'fixed', 'percent')", name="ck_bcfg_deposit_mode"),
        sa.CheckConstraint("min_notice_minutes >= 0", name="ck_bcfg_min_notice"),
        sa.CheckConstraint("max_advance_days >= 1", name="ck_bcfg_max_advance"),
        sa.CheckConstraint("buffer_before_minutes >= 0", name="ck_bcfg_buffer_before"),
        sa.CheckConstraint("buffer_after_minutes >= 0", name="ck_bcfg_buffer_after"),
        sa.CheckConstraint("cancellation_cutoff_hours >= 0", name="ck_bcfg_cancel_cutoff"),
        sa.CheckConstraint(
            "cancellation_fee_percent >= 0 AND cancellation_fee_percent <= 100",
            name="ck_bcfg_cancel_fee_pct",
        ),
        sa.CheckConstraint("deposit_value >= 0", name="ck_bcfg_deposit_value"),
        sa.CheckConstraint("hold_ttl_minutes >= 1", name="ck_bcfg_hold_ttl"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", "booking_model", name="uq_bcfg_business_model"),
    )
    op.create_index(op.f("ix_business_booking_configs_business_id"), "business_booking_configs", ["business_id"], unique=False)

    op.create_table(
        "bookings",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("business_id", sa.String(length=64), nullable=False),
        sa.Column("customer_id", sa.String(length=64), nullable=False),
        sa.Column("booking_model", sa.String(length=32), nullable=False),
        sa.Column("title_snapshot", sa.String(length=200), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("confirmation_mode", sa.String(length=32), nullable=False),
        sa.Column("subtotal_amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("discount_amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("tax_amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("deposit_due_amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("amount_paid", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("refunded_amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("payment_status", sa.String(length=32), nullable=False),
        sa.Column("payment_method", sa.String(length=32), nullable=True),
        sa.Column("cancellation_cutoff_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancellation_policy_snapshot", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("hold_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("check_in_code", sa.String(length=64), nullable=True),
        sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("booking_model IN ('appointment', 'resource', 'ticket', 'capacity')", name="ck_bookings_model"),
        sa.CheckConstraint(
            "status IN ('held', 'pending', 'confirmed', 'completed', 'cancelled', 'rejected', 'no_show', 'expired')",
            name="ck_bookings_status",
        ),
        sa.CheckConstraint(
            "payment_status IN ('unpaid', 'deposit_paid', 'paid', 'partially_refunded', 'refunded', 'deposit')",
            name="ck_bookings_payment_status",
        ),
        sa.CheckConstraint("end_at IS NULL OR start_at IS NULL OR end_at > start_at", name="ck_bookings_valid_range"),
        sa.CheckConstraint(
            "quantity >= 1 AND subtotal_amount >= 0 AND discount_amount >= 0 AND tax_amount >= 0 "
            "AND total_amount >= 0 AND deposit_due_amount >= 0 AND amount_paid >= 0 AND refunded_amount >= 0",
            name="ck_bookings_non_negative_amounts",
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("check_in_code"),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index("ix_bookings_business_model_start", "bookings", ["business_id", "booking_model", "start_at"], unique=False)
    op.create_index("ix_bookings_customer_start", "bookings", ["customer_id", "start_at"], unique=False)
    op.create_index(op.f("ix_bookings_status"), "bookings", ["status"], unique=False)
    op.create_index(
        "ix_bookings_held_expires",
        "bookings",
        ["status", "hold_expires_at"],
        unique=False,
        postgresql_where=sa.text("status = 'held'"),
    )

    op.create_table(
        "booking_status_history",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("booking_id", sa.String(length=64), nullable=False),
        sa.Column("from_status", sa.String(length=32), nullable=True),
        sa.Column("to_status", sa.String(length=32), nullable=False),
        sa.Column("changed_by_user_id", sa.String(length=64), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_booking_status_history_booking_id"), "booking_status_history", ["booking_id"], unique=False)

    op.create_table(
        "resources",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("business_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("resource_type", sa.String(length=48), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("capacity_people", sa.Integer(), nullable=False),
        sa.Column("units_total", sa.Integer(), nullable=False),
        sa.Column("pricing_unit", sa.String(length=24), nullable=False),
        sa.Column("slot_duration_minutes", sa.Integer(), nullable=True),
        sa.Column("min_duration_minutes", sa.Integer(), nullable=False),
        sa.Column("max_duration_minutes", sa.Integer(), nullable=True),
        sa.Column("buffer_minutes", sa.Integer(), nullable=False),
        sa.Column("base_price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("deposit_amount", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("schedule_hours", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=True),
        sa.Column("attributes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("units_total >= 1 AND capacity_people >= 1 AND base_price >= 0", name="ck_resources_positive"),
        sa.CheckConstraint(
            "pricing_unit IN ('per_slot', 'per_hour', 'per_day', 'per_night')",
            name="ck_resources_pricing_unit",
        ),
        sa.CheckConstraint("min_duration_minutes >= 15 AND buffer_minutes >= 0", name="ck_resources_durations"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_resources_business_active_type", "resources", ["business_id", "active", "resource_type"], unique=False)
    op.create_index(op.f("ix_resources_business_id"), "resources", ["business_id"], unique=False)

    op.create_table(
        "resource_blocks",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=64), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("units_blocked", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("end_at > start_at AND units_blocked >= 1", name="ck_resource_blocks_valid"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["resource_id"], ["resources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_resource_blocks_resource_range", "resource_blocks", ["resource_id", "start_at", "end_at"], unique=False)

    op.create_table(
        "resource_allocations",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("booking_id", sa.String(length=64), nullable=False),
        sa.Column("business_id", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=64), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("quantity_units", sa.Integer(), nullable=False),
        sa.Column("party_size", sa.Integer(), nullable=False),
        sa.Column("is_exclusive_unit", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=10, scale=2), nullable=False),
        postgresql.ExcludeConstraint(
            (sa.column("resource_id"), "="),
            (sa.text("tstzrange(start_at, end_at, '[)')"), "&&"),
            where=sa.text("is_exclusive_unit = true AND status IN ('held', 'pending', 'confirmed')"),
            using="gist",
            name="excl_resource_exclusive_unit_overlap",
        ),
        sa.CheckConstraint("end_at > start_at AND quantity_units >= 1 AND party_size >= 1", name="ck_resource_alloc_valid"),
        sa.CheckConstraint("unit_price >= 0", name="ck_resource_alloc_price"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resource_id"], ["resources.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_resource_allocations_booking_id"), "resource_allocations", ["booking_id"], unique=False)
    op.create_index(op.f("ix_resource_allocations_status"), "resource_allocations", ["status"], unique=False)
    op.create_index("ix_resource_alloc_resource_range", "resource_allocations", ["resource_id", "start_at", "end_at"], unique=False)

    op.create_table(
        "event_offerings",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("business_id", sa.String(length=64), nullable=False),
        sa.Column("booking_model", sa.String(length=16), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("venue_area", sa.String(length=200), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("cancellation_policy", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("booking_model IN ('ticket', 'capacity')", name="ck_event_offerings_model"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_event_offerings_business_id"), "event_offerings", ["business_id"], unique=False)
    op.create_index(
        "ix_event_offerings_business_model_active",
        "event_offerings",
        ["business_id", "booking_model", "active"],
        unique=False,
    )

    op.create_table(
        "event_sessions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("offering_id", sa.String(length=64), nullable=False),
        sa.Column("business_id", sa.String(length=64), nullable=False),
        sa.Column("instructor_employee_id", sa.String(length=64), nullable=True),
        sa.Column("resource_id", sa.String(length=64), nullable=True),
        sa.Column("title_override", sa.String(length=200), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("sales_start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sales_end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_capacity", sa.Integer(), nullable=False),
        sa.Column("reserved_count", sa.Integer(), nullable=False),
        sa.Column("max_per_booking", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.CheckConstraint("end_at > start_at", name="ck_event_sessions_range"),
        sa.CheckConstraint(
            "total_capacity >= 1 AND reserved_count >= 0 AND reserved_count <= total_capacity AND max_per_booking >= 1",
            name="ck_event_sessions_capacity",
        ),
        sa.CheckConstraint(
            "status IN ('scheduled', 'on_sale', 'sold_out', 'cancelled', 'completed')",
            name="ck_event_sessions_status",
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["instructor_employee_id"], ["employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["offering_id"], ["event_offerings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resource_id"], ["resources.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_event_sessions_business_start", "event_sessions", ["business_id", "start_at", "status"], unique=False)
    op.create_index(op.f("ix_event_sessions_offering_id"), "event_sessions", ["offering_id"], unique=False)

    op.create_table(
        "ticket_tiers",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=False),
        sa.Column("business_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("capacity_limit", sa.Integer(), nullable=True),
        sa.Column("reserved_count", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "price >= 0 AND reserved_count >= 0 AND (capacity_limit IS NULL OR (capacity_limit >= 1 AND reserved_count <= capacity_limit))",
            name="ck_ticket_tiers_valid",
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["event_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ticket_tiers_session_id"), "ticket_tiers", ["session_id"], unique=False)

    op.create_table(
        "ticket_passes",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("booking_id", sa.String(length=64), nullable=False),
        sa.Column("business_id", sa.String(length=64), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=False),
        sa.Column("tier_id", sa.String(length=64), nullable=True),
        sa.Column("attendee_name", sa.String(length=120), nullable=True),
        sa.Column("attendee_email", sa.String(length=255), nullable=True),
        sa.Column("seat_label", sa.String(length=40), nullable=True),
        sa.Column("unit_price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("pass_code", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checked_in_by_user_id", sa.String(length=64), nullable=True),
        sa.CheckConstraint("unit_price >= 0", name="ck_ticket_passes_price"),
        sa.CheckConstraint(
            "status IN ('valid', 'checked_in', 'cancelled', 'refunded', 'expired')",
            name="ck_ticket_passes_status",
        ),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["checked_in_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["session_id"], ["event_sessions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["tier_id"], ["ticket_tiers.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pass_code"),
    )
    op.create_index(op.f("ix_ticket_passes_booking_id"), "ticket_passes", ["booking_id"], unique=False)
    op.create_index("ix_ticket_passes_session_status", "ticket_passes", ["session_id", "status"], unique=False)

    # Non-destructive additive bridge columns on existing tables
    # CRITICAL: Never use ON DELETE CASCADE on appointments.booking_id.
    op.add_column("appointments", sa.Column("booking_id", sa.String(length=64), nullable=True))
    op.create_unique_constraint("uq_appointments_booking_id", "appointments", ["booking_id"])
    op.create_foreign_key(
        "fk_appointments_booking_id",
        "appointments",
        "bookings",
        ["booking_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("reviews", sa.Column("booking_id", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_reviews_booking_id"), "reviews", ["booking_id"], unique=False)
    op.create_foreign_key(
        "fk_reviews_booking_id",
        "reviews",
        "bookings",
        ["booking_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_reviews_booking_id", "reviews", type_="foreignkey")
    op.drop_index(op.f("ix_reviews_booking_id"), table_name="reviews")
    op.drop_column("reviews", "booking_id")

    op.drop_constraint("fk_appointments_booking_id", "appointments", type_="foreignkey")
    op.drop_constraint("uq_appointments_booking_id", "appointments", type_="unique")
    op.drop_column("appointments", "booking_id")

    op.drop_index("ix_ticket_passes_session_status", table_name="ticket_passes")
    op.drop_index(op.f("ix_ticket_passes_booking_id"), table_name="ticket_passes")
    op.drop_table("ticket_passes")

    op.drop_index(op.f("ix_ticket_tiers_session_id"), table_name="ticket_tiers")
    op.drop_table("ticket_tiers")

    op.drop_index(op.f("ix_event_sessions_offering_id"), table_name="event_sessions")
    op.drop_index("ix_event_sessions_business_start", table_name="event_sessions")
    op.drop_table("event_sessions")

    op.drop_index("ix_event_offerings_business_model_active", table_name="event_offerings")
    op.drop_index(op.f("ix_event_offerings_business_id"), table_name="event_offerings")
    op.drop_table("event_offerings")

    op.drop_index("ix_resource_alloc_resource_range", table_name="resource_allocations")
    op.drop_index(op.f("ix_resource_allocations_status"), table_name="resource_allocations")
    op.drop_index(op.f("ix_resource_allocations_booking_id"), table_name="resource_allocations")
    op.drop_table("resource_allocations")

    op.drop_index("ix_resource_blocks_resource_range", table_name="resource_blocks")
    op.drop_table("resource_blocks")

    op.drop_index(op.f("ix_resources_business_id"), table_name="resources")
    op.drop_index("ix_resources_business_active_type", table_name="resources")
    op.drop_table("resources")

    op.drop_index(op.f("ix_booking_status_history_booking_id"), table_name="booking_status_history")
    op.drop_table("booking_status_history")

    op.drop_index("ix_bookings_held_expires", table_name="bookings")
    op.drop_index(op.f("ix_bookings_status"), table_name="bookings")
    op.drop_index("ix_bookings_customer_start", table_name="bookings")
    op.drop_index("ix_bookings_business_model_start", table_name="bookings")
    op.drop_table("bookings")

    op.drop_index(op.f("ix_business_booking_configs_business_id"), table_name="business_booking_configs")
    op.drop_table("business_booking_configs")
