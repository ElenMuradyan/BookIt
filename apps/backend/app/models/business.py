from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, new_id, utc_now


class Business(Base, TimestampMixin):
    __tablename__ = "businesses"
    __table_args__ = (
        Index("ix_businesses_public_category", "is_public", "status", "category"),
        Index("ix_businesses_city", "city"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("biz"))
    owner_user_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    legal_name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    country: Mapped[str] = mapped_column(String(120), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="America/Los_Angeles")
    location: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    phone: Mapped[str] = mapped_column(String(40), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    socials: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, default=list)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    gallery: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, default=list)
    hours: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    holidays: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, default=list)
    blocked: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, default=list)
    rating: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    review_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    price_level: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="submitted", index=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    distance_miles: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tags: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    cuisine: Mapped[str | None] = mapped_column(String(120), nullable=True)
    specialty: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cancellation_policy: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="Free cancellation up to 24 hours before the appointment.",
    )
    booking_approval: Mapped[str] = mapped_column(String(32), nullable=False, default="automatic")
    min_notice_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    max_advance_days: Mapped[int] = mapped_column(Integer, nullable=False, default=90)

    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )
    applications: Mapped[list["BusinessApplication"]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )


class BusinessApplication(Base):
    __tablename__ = "business_applications"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("app"))
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    applicant_user_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="submitted", index=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    documents: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, default=list)

    business: Mapped["Business"] = relationship(back_populates="applications")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "business_id", name="uq_membership_user_business"),
        Index("ix_memberships_business_status", "business_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("mem"))
    user_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    business: Mapped["Business"] = relationship(back_populates="memberships")
