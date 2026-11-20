from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, new_id, utc_now


class EmployeeService(Base):
    __tablename__ = "employee_services"

    employee_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("employees.id", ondelete="CASCADE"),
        primary_key=True,
    )
    service_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("services.id", ondelete="CASCADE"),
        primary_key=True,
    )


class Service(Base):
    __tablename__ = "services"
    __table_args__ = (
        Index("ix_services_business_active", "business_id", "active"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("svc"))
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    deposit_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    requires_approval: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cancellation_policy: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="Free cancellation up to 24 hours before the visit.",
    )

    employees: Mapped[list["Employee"]] = relationship(
        secondary="employee_services",
        back_populates="services",
    )


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        Index("ix_employees_business_status", "business_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("emp"))
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    membership_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("memberships.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    bio: Mapped[str] = mapped_column(Text, nullable=False, default="")
    hours: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="available")
    rating: Mapped[float] = mapped_column(Float, nullable=False, default=5.0)

    services: Mapped[list["Service"]] = relationship(
        secondary="employee_services",
        back_populates="employees",
    )


class ProductCategory(Base):
    __tablename__ = "product_categories"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("cat"))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_business_active", "business_id", "active"),
        Index("ix_products_category_active", "category_id", "active"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("prd"))
    business_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("product_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    compare_at_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    image_url: Mapped[str] = mapped_column(Text, nullable=False)
    images: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, default=list)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rating: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    review_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    popular: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    discount_label: Mapped[str | None] = mapped_column(String(64), nullable=True)

    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
    )


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("var"))
    product_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    price_delta: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    size: Mapped[str | None] = mapped_column(String(32), nullable=True)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)

    product: Mapped["Product"] = relationship(back_populates="variants")
