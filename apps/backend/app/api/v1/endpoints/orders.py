from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies.auth import require_user
from app.core.database import get_db
from app.models.base import new_id, utc_now
from app.models.business import Business
from app.models.catalog import Product, ProductVariant
from app.models.commerce import Cart, CartItem, Order, OrderItem, Payment
from app.models.engagement import Notification, PromoCode
from app.models.user import Address, User
from app.schemas.commerce import (
    CartItemAddIn,
    CartItemOut,
    CartItemQuantityIn,
    CartOut,
    CheckoutIn,
    CheckoutOut,
    OrderItemOut,
    OrderOut,
    OrderStatusIn,
)
from app.services.rbac import require_business_permission

router = APIRouter(tags=["orders"])

ALLOWED_ORDER_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"confirmed", "processing", "ready_for_pickup", "shipped", "completed", "cancelled"},
    "confirmed": {"processing", "ready_for_pickup", "shipped", "completed", "cancelled"},
    "processing": {"ready_for_pickup", "shipped", "completed", "cancelled"},
    "ready_for_pickup": {"completed", "cancelled"},
    "shipped": {"completed", "refunded"},
    "completed": {"refunded"},
    "cancelled": set(),
    "refunded": set(),
}


def _serialize_cart(cart: Cart) -> CartOut:
    return CartOut(
        id=cart.id,
        user_id=cart.user_id,
        items=[
            CartItemOut(
                id=i.id,
                product_id=i.product_id,
                variant_id=i.variant_id,
                quantity=i.quantity,
                seller_id=i.seller_id,
            )
            for i in cart.items
        ],
        updated_at=cart.updated_at,
    )


def _serialize_order(o: Order) -> OrderOut:
    return OrderOut(
        id=o.id,
        checkout_group_id=o.checkout_group_id,
        user_id=o.user_id,
        seller_id=o.seller_id,
        items=[
            OrderItemOut(
                id=i.id,
                product_id=i.product_id,
                variant_id=i.variant_id,
                name=i.name,
                quantity=i.quantity,
                unit_price=float(i.unit_price),
                seller_id=i.seller_id,
            )
            for i in o.items
        ],
        status=o.status,
        payment_status=o.payment_status,
        payment_method=o.payment_method,
        subtotal=float(o.subtotal),
        delivery_fee=float(o.delivery_fee),
        total=float(o.total),
        currency=o.currency,
        address_id=o.address_id,
        delivery_method=o.delivery_method,
        tracking_placeholder=o.tracking_placeholder,
        created_at=o.created_at,
        updated_at=o.updated_at,
    )


async def _get_or_create_cart(db: AsyncSession, user_id: str) -> Cart:
    cart = (
        await db.execute(
            select(Cart)
            .execution_options(populate_existing=True)
            .options(selectinload(Cart.items))
            .where(Cart.user_id == user_id)
        )
    ).scalar_one_or_none()
    if not cart:
        cart = Cart(id=new_id("cart"), user_id=user_id)
        db.add(cart)
        await db.commit()
        cart = (
            await db.execute(
                select(Cart)
                .execution_options(populate_existing=True)
                .options(selectinload(Cart.items))
                .where(Cart.user_id == user_id)
            )
        ).scalar_one()
    return cart


@router.get("/cart", response_model=CartOut)
async def get_cart(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    cart = await _get_or_create_cart(db, user.id)
    return _serialize_cart(cart)


@router.post("/cart/items", response_model=CartOut)
async def add_cart_item(
    payload: CartItemAddIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    product = (
        await db.execute(
            select(Product).options(selectinload(Product.variants)).where(Product.id == payload.product_id, Product.active.is_(True))
        )
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That product is not available")

    seller = await db.get(Business, product.business_id)
    if not seller or not seller.is_public or seller.status != "approved":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That product is not available")

    variant = None
    if payload.variant_id:
        variant = next((v for v in product.variants if v.id == payload.variant_id), None)
        if not variant:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose an available option")

    available_stock = variant.stock if variant else product.stock
    cart = await _get_or_create_cart(db, user.id)
    existing = next((i for i in cart.items if i.product_id == product.id and i.variant_id == payload.variant_id), None)
    existing_qty = existing.quantity if existing else 0
    if payload.quantity + existing_qty > available_stock:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Not enough stock")

    if existing:
        existing.quantity += payload.quantity
    else:
        db.add(
            CartItem(
                id=new_id("ci"),
                cart_id=cart.id,
                product_id=product.id,
                variant_id=payload.variant_id,
                quantity=payload.quantity,
                seller_id=product.business_id,
            )
        )
    await db.commit()
    refreshed = await _get_or_create_cart(db, user.id)
    return _serialize_cart(refreshed)


@router.patch("/cart/items/{item_id}", response_model=CartOut)
async def update_cart_item(
    item_id: str,
    payload: CartItemQuantityIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    cart = await _get_or_create_cart(db, user.id)
    line = next((i for i in cart.items if i.id == item_id), None)
    if not line:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart item not found")

    if payload.quantity <= 0:
        await db.delete(line)
    else:
        product = await db.get(Product, line.product_id)
        if not product or not product.active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That product is no longer available")
        if line.variant_id:
            variant = await db.get(ProductVariant, line.variant_id)
            if not variant or variant.product_id != product.id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Selected option is no longer available")
            available_stock = variant.stock
        else:
            available_stock = product.stock
        if payload.quantity > available_stock:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Not enough stock")
        line.quantity = payload.quantity
    await db.commit()
    refreshed = await _get_or_create_cart(db, user.id)
    return _serialize_cart(refreshed)


@router.post("/checkout", response_model=CheckoutOut, status_code=status.HTTP_201_CREATED)
async def checkout_cart(
    payload: CheckoutIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    cart = (
        await db.execute(
            select(Cart).options(selectinload(Cart.items)).where(Cart.user_id == user.id).with_for_update()
        )
    ).scalar_one_or_none()
    if not cart or not cart.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Your cart is empty")

    address = await db.get(Address, payload.address_id)
    if not address or address.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a valid delivery address")

    fee = 12.0 if payload.delivery_method == "express" else (6.0 if payload.delivery_method == "standard" else 0.0)
    group_id = new_id("chk")
    order_ids: list[str] = []

    today_iso = utc_now().date().isoformat()
    # Deterministic lock ordering across all cart lines prevents PostgreSQL deadlocks on multi-item checkouts
    ordered_lines = sorted(cart.items, key=lambda l: (l.seller_id, l.product_id, l.variant_id or ""))
    sellers = list(dict.fromkeys(line.seller_id for line in ordered_lines))
    for seller_id in sellers:
        seller = await db.get(Business, seller_id)
        if not seller or not seller.is_public or seller.status != "approved":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A seller in your cart is unavailable")
        seller_lines = [line for line in ordered_lines if line.seller_id == seller_id]
        order_id = new_id("ord")
        order_ids.append(order_id)
        order_items: list[OrderItem] = []
        subtotal = 0.0

        for line in seller_lines:
            product = (
                await db.execute(select(Product).where(Product.id == line.product_id).with_for_update())
            ).scalar_one_or_none()
            if not product or not product.active or product.business_id != seller_id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A product in your cart is unavailable")
            variant: ProductVariant | None = None
            if line.variant_id:
                variant = (
                    await db.execute(
                        select(ProductVariant)
                        .where(ProductVariant.id == line.variant_id, ProductVariant.product_id == product.id)
                        .with_for_update()
                    )
                ).scalar_one_or_none()
                if not variant or variant.stock < line.quantity:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Not enough stock for {product.name}")
                variant.stock -= line.quantity
            elif product.stock < line.quantity:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Not enough stock for {product.name}")

            product.stock = max(0, product.stock - line.quantity)
            unit_price = max(0.0, float(product.price) + (float(variant.price_delta) if variant else 0.0))
            subtotal += unit_price * line.quantity
            order_items.append(
                OrderItem(
                    id=new_id("oi"),
                    order_id=order_id,
                    product_id=product.id,
                    variant_id=line.variant_id,
                    name=f"{product.name} · {variant.label}" if variant else product.name,
                    quantity=line.quantity,
                    unit_price=unit_price,
                    seller_id=seller_id,
                )
            )

        if payload.promo_code:
            promo = (
                await db.execute(
                    select(PromoCode)
                    .where(
                        PromoCode.business_id == seller_id,
                        PromoCode.code == payload.promo_code.strip().upper(),
                        PromoCode.active.is_(True),
                    )
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if promo and promo.expires_on >= today_iso:
                subtotal = round(subtotal * (1 - promo.percent_off / 100.0), 2)
                promo.redemptions += 1

        total = round(subtotal + fee, 2)
        order = Order(
            id=order_id,
            checkout_group_id=group_id,
            user_id=user.id,
            seller_id=seller_id,
            status="pending",
            payment_status="unpaid" if payload.payment_method in ("in_person", "pay_on_pickup") else "pending",
            payment_method=payload.payment_method,
            subtotal=round(subtotal, 2),
            delivery_fee=fee,
            total=total,
            currency="USD",
            address_id=address.id,
            delivery_method=payload.delivery_method,
            tracking_placeholder="Tracking appears when the seller ships",
            items=order_items,
        )
        db.add(order)
        db.add(
            Payment(
                id=new_id("pay"),
                payer_id=user.id,
                business_id=seller_id,
                amount=total,
                currency="USD",
                status="pending",
                method=payload.payment_method,
                reference_type="order",
                reference_id=order_id,
                provider="sandbox_unconfigured",
                note="Order created; awaiting payment settlement or pickup payment.",
            )
        )
        seller = await db.get(Business, seller_id)
        db.add(
            Notification(
                id=new_id("ntf"),
                user_id=user.id,
                business_id=seller_id,
                category="order",
                title="Order placed",
                body=f"{seller.name if seller else 'Seller'} received your order.",
                href=f"/orders/{order_id}",
            )
        )

    for item in list(cart.items):
        await db.delete(item)

    await db.commit()
    return CheckoutOut(order_ids=order_ids, checkout_group_id=group_id)


@router.get("/orders", response_model=list[OrderOut])
async def list_orders(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    business_id: str | None = Query(default=None, alias="businessId"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    if business_id:
        await require_business_permission(db, user, business_id, "orders.manage")
        stmt = select(Order).options(selectinload(Order.items)).where(Order.seller_id == business_id)
    else:
        stmt = select(Order).options(selectinload(Order.items)).where(Order.user_id == user.id)
    stmt = stmt.order_by(Order.created_at.desc()).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_order(r) for r in rows]


@router.patch("/workspaces/{business_id}/orders/{order_id}", response_model=OrderOut)
async def update_order_status(
    business_id: str,
    order_id: str,
    payload: OrderStatusIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "orders.manage")
    order = (
        await db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.id == order_id, Order.seller_id == business_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if order.status != payload.status:
        allowed_next = ALLOWED_ORDER_TRANSITIONS.get(order.status, set())
        if payload.status not in allowed_next:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot transition order from {order.status} to {payload.status}",
            )

    order.status = payload.status
    if payload.status == "shipped":
        order.tracking_placeholder = f"Tracking {order.id.upper()}"
    if payload.status == "refunded":
        order.payment_status = "refunded"
    db.add(
        Notification(
            id=new_id("ntf"),
            user_id=order.user_id,
            business_id=business_id,
            category="order",
            title=f"Order {payload.status.replace('_', ' ')}",
            body=f"{order.id} was updated.",
            href=f"/orders/{order.id}",
        )
    )
    await db.commit()
    await db.refresh(order)
    return _serialize_order(order)
