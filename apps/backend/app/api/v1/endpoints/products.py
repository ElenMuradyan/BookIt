from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies.auth import get_optional_user, require_user
from app.core.database import get_db
from app.models.base import new_id
from app.models.business import Business
from app.models.catalog import Product, ProductCategory
from app.models.user import User
from app.schemas.catalog import ProductActiveIn, ProductCategoryOut, ProductIn, ProductOut, ProductVariantOut
from app.services.rbac import ensure_business_visible, require_business_permission

router = APIRouter(tags=["products"])


def _serialize_product(p: Product) -> ProductOut:
    return ProductOut(
        id=p.id,
        business_id=p.business_id,
        category_id=p.category_id,
        name=p.name,
        description=p.description,
        price=float(p.price),
        compare_at_price=float(p.compare_at_price) if p.compare_at_price is not None else None,
        currency=p.currency,
        image_url=p.image_url,
        images=p.images or [],  # type: ignore[arg-type]
        stock=p.stock,
        active=p.active,
        variants=[
            ProductVariantOut(
                id=v.id,
                sku=v.sku,
                label=v.label,
                stock=v.stock,
                price_delta=float(v.price_delta),
                size=v.size,
                color=v.color,
            )
            for v in p.variants
        ],
        rating=p.rating,
        review_count=p.review_count,
        created_at=p.created_at,
        featured=p.featured,
        popular=p.popular,
        discount_label=p.discount_label,
    )


@router.get("/product-categories", response_model=list[ProductCategoryOut])
async def list_product_categories(db: Annotated[AsyncSession, Depends(get_db)]):
    rows = (await db.execute(select(ProductCategory).order_by(ProductCategory.name.asc()))).scalars().all()
    return [ProductCategoryOut.model_validate(r) for r in rows]


@router.get("/products", response_model=list[ProductOut])
async def search_products(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str | None = None,
    product_category: str | None = Query(default=None, alias="productCategory"),
    min_price: float | None = Query(default=None, ge=0),
    max_price: float | None = Query(default=None, ge=0),
    min_rating: float | None = Query(default=None, ge=0, le=5),
    in_stock: bool = Query(default=False, alias="inStock"),
    sort: str = "popular",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    stmt = (
        select(Product)
        .join(Business, Business.id == Product.business_id)
        .options(selectinload(Product.variants))
        .where(Business.is_public.is_(True), Business.status == "approved", Product.active.is_(True))
    )
    if product_category:
        stmt = stmt.where(Product.category_id == product_category)
    if min_price is not None:
        stmt = stmt.where(Product.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Product.price <= max_price)
    if min_rating is not None:
        stmt = stmt.where(Product.rating >= min_rating)
    if in_stock:
        stmt = stmt.where(Product.stock > 0)
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(like),
                Product.description.ilike(like),
                Business.name.ilike(like),
            )
        )
    if sort == "price_asc":
        stmt = stmt.order_by(Product.price.asc())
    elif sort == "price_desc":
        stmt = stmt.order_by(Product.price.desc())
    elif sort == "newest":
        stmt = stmt.order_by(Product.created_at.desc())
    else:
        stmt = stmt.order_by(Product.popular.desc(), Product.rating.desc())

    rows = (await db.execute(stmt.offset(offset).limit(limit))).scalars().all()
    return [_serialize_product(r) for r in rows]


@router.get("/products/{product_id}", response_model=ProductOut)
async def get_product(
    product_id: str,
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    product = (
        await db.execute(select(Product).options(selectinload(Product.variants)).where(Product.id == product_id))
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    _, is_member = await ensure_business_visible(db, product.business_id, user)
    if not is_member and not product.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return _serialize_product(product)


@router.post("/workspaces/{business_id}/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    business_id: str,
    payload: ProductIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "products.manage")
    product = Product(
        id=new_id("prd"),
        business_id=business_id,
        category_id=payload.category_id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        price=payload.price,
        currency="USD",
        image_url=payload.image_url or "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
        images=[],
        stock=payload.stock,
        active=payload.stock > 0,
    )
    db.add(product)
    await db.commit()
    loaded = (
        await db.execute(select(Product).options(selectinload(Product.variants)).where(Product.id == product.id))
    ).scalar_one()
    return _serialize_product(loaded)


@router.put("/workspaces/{business_id}/products/{product_id}", response_model=ProductOut)
async def update_product(
    business_id: str,
    product_id: str,
    payload: ProductIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "products.manage")
    product = (
        await db.execute(
            select(Product).options(selectinload(Product.variants)).where(Product.id == product_id, Product.business_id == business_id)
        )
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    product.name = payload.name.strip()
    product.description = payload.description.strip()
    product.category_id = payload.category_id
    product.price = payload.price
    product.stock = payload.stock
    product.active = payload.stock > 0
    if payload.image_url:
        product.image_url = payload.image_url
    await db.commit()
    await db.refresh(product)
    return _serialize_product(product)


@router.patch("/workspaces/{business_id}/products/{product_id}/active", response_model=ProductOut)
async def set_product_active(
    business_id: str,
    product_id: str,
    payload: ProductActiveIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "products.manage")
    product = (
        await db.execute(
            select(Product).options(selectinload(Product.variants)).where(Product.id == product_id, Product.business_id == business_id)
        )
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    product.active = payload.active
    await db.commit()
    return _serialize_product(product)
