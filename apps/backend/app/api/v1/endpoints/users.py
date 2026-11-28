from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_user
from app.core.database import get_db
from app.models.base import new_id, utc_now
from app.models.business import Business, Membership
from app.models.catalog import Employee, Product, Service
from app.models.engagement import Favorite
from app.models.user import Address, CustomerProfile, User
from app.schemas.auth import (
    AddressCreateIn,
    AddressOut,
    ConsentUpdateIn,
    CustomerProfileOut,
    NotificationPrefsUpdateIn,
    ProfileUpdateIn,
    SpendingVisibilityIn,
    ThemeUpdateIn,
    UserOut,
)
from app.schemas.common import OkResponse
from app.schemas.engagement import FavoriteMoveIn, FavoriteOut, FavoriteToggleIn
from app.services.auth_service import serialize_profile

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
async def update_my_profile(
    payload: ProfileUpdateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(user, field, value)

    profile = await db.get(CustomerProfile, user.id)
    if profile:
        if payload.language is not None:
            profile.language = payload.language
        if payload.interests is not None:
            profile.interests = payload.interests

    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.put("/me/consent", response_model=CustomerProfileOut)
async def set_consent(
    payload: ConsentUpdateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    profile = await db.get(CustomerProfile, user.id)
    if not profile:
        profile = CustomerProfile(user_id=user.id)
        db.add(profile)
    profile.personalization_consent = payload.consent
    profile.consent_updated_at = utc_now()
    await db.commit()
    await db.refresh(profile)
    return serialize_profile(profile)  # type: ignore[return-value]


@router.put("/me/theme", response_model=CustomerProfileOut)
async def set_theme(
    payload: ThemeUpdateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    profile = await db.get(CustomerProfile, user.id)
    if not profile:
        profile = CustomerProfile(user_id=user.id)
        db.add(profile)
    profile.theme = payload.theme
    await db.commit()
    await db.refresh(profile)
    return serialize_profile(profile)  # type: ignore[return-value]


@router.put("/me/spending-visibility", response_model=CustomerProfileOut)
async def set_spending_visibility(
    payload: SpendingVisibilityIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    profile = await db.get(CustomerProfile, user.id)
    if not profile:
        profile = CustomerProfile(user_id=user.id)
        db.add(profile)
    profile.spending_visibility = payload.visibility
    await db.commit()
    await db.refresh(profile)
    return serialize_profile(profile)  # type: ignore[return-value]


@router.patch("/me/notification-preferences", response_model=CustomerProfileOut)
async def update_notification_preferences(
    payload: NotificationPrefsUpdateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    profile = await db.get(CustomerProfile, user.id)
    if not profile:
        profile = CustomerProfile(user_id=user.id)
        db.add(profile)
    current = dict(profile.notification_preferences or {})
    current.update(payload.model_dump(exclude_none=True))
    profile.notification_preferences = current
    await db.commit()
    await db.refresh(profile)
    return serialize_profile(profile)  # type: ignore[return-value]


@router.get("/me/addresses", response_model=list[AddressOut])
async def list_addresses(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (await db.execute(select(Address).where(Address.user_id == user.id))).scalars().all()
    return [AddressOut.model_validate(r) for r in rows]


@router.post("/me/addresses", response_model=AddressOut, status_code=status.HTTP_201_CREATED)
async def create_address(
    payload: AddressCreateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    existing = (await db.execute(select(Address.id).where(Address.user_id == user.id))).first()
    addr = Address(
        id=new_id("addr"),
        user_id=user.id,
        label=payload.label,
        line1=payload.line1,
        line2=payload.line2,
        city=payload.city,
        region=payload.region,
        postal_code=payload.postal_code,
        country=payload.country,
        is_default=existing is None,
    )
    db.add(addr)
    await db.commit()
    await db.refresh(addr)
    return AddressOut.model_validate(addr)


@router.get("/me/favorites", response_model=list[FavoriteOut])
async def list_favorites(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (await db.execute(select(Favorite).where(Favorite.user_id == user.id))).scalars().all()
    return [FavoriteOut.model_validate(r) for r in rows]


async def _user_can_view_business(db: AsyncSession, user: User, business: Business | None) -> bool:
    if not business:
        return False
    if business.is_public and business.status == "approved":
        return True
    if user.is_platform_admin or business.owner_user_id == user.id:
        return True
    membership = (
        await db.execute(
            select(Membership.id).where(
                Membership.business_id == business.id,
                Membership.user_id == user.id,
                Membership.status == "active",
            )
        )
    ).scalar_one_or_none()
    return membership is not None


async def _validate_favorite_target(
    db: AsyncSession,
    user: User,
    target_type: str,
    target_id: str,
) -> None:
    if target_type == "business":
        biz = await db.get(Business, target_id)
        if await _user_can_view_business(db, user, biz):
            return
    elif target_type == "service":
        svc = await db.get(Service, target_id)
        if svc and svc.active:
            biz = await db.get(Business, svc.business_id)
            if await _user_can_view_business(db, user, biz):
                return
    elif target_type == "employee":
        emp = await db.get(Employee, target_id)
        if emp:
            biz = await db.get(Business, emp.business_id)
            if await _user_can_view_business(db, user, biz):
                return
    elif target_type == "product":
        prd = await db.get(Product, target_id)
        if prd and prd.active:
            biz = await db.get(Business, prd.business_id)
            if await _user_can_view_business(db, user, biz):
                return

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Target not found or unavailable",
    )


@router.post("/me/favorites/toggle", response_model=OkResponse)
async def toggle_favorite(
    payload: FavoriteToggleIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = select(Favorite).where(
        Favorite.user_id == user.id,
        Favorite.target_type == payload.target_type,
        Favorite.target_id == payload.target_id,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
        return OkResponse(ok=True, message="Removed from favorites")

    await _validate_favorite_target(db, user, payload.target_type, payload.target_id)

    db.add(
        Favorite(
            id=new_id("fav"),
            user_id=user.id,
            target_type=payload.target_type,
            target_id=payload.target_id,
            collection=payload.collection,
        )
    )
    await db.commit()
    return OkResponse(ok=True, message="Saved to favorites")


@router.patch("/me/favorites/{favorite_id}", response_model=FavoriteOut)
async def move_favorite(
    favorite_id: str,
    payload: FavoriteMoveIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    fav = await db.get(Favorite, favorite_id)
    if not fav or fav.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Favorite not found")
    fav.collection = payload.collection
    await db.commit()
    await db.refresh(fav)
    return FavoriteOut.model_validate(fav)
