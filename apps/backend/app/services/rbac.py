from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business, Membership
from app.models.user import User

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "owner": {
        "overview.view",
        "calendar.view",
        "calendar.manage",
        "bookings.view",
        "bookings.manage",
        "services.view",
        "services.manage",
        "team.view",
        "team.manage",
        "customers.view",
        "customers.notes",
        "products.manage",
        "orders.manage",
        "finance.view",
        "finance.manage",
        "marketing.manage",
        "settings.profile",
        "settings.policies",
        "settings.payments",
        "settings.security",
        "subscription.manage",
    },
    "admin": {
        "overview.view",
        "calendar.view",
        "calendar.manage",
        "bookings.view",
        "bookings.manage",
        "services.view",
        "services.manage",
        "team.view",
        "team.manage",
        "customers.view",
        "customers.notes",
        "products.manage",
        "orders.manage",
        "finance.view",
        "finance.manage",
        "marketing.manage",
        "settings.profile",
        "settings.policies",
        "settings.payments",
        "settings.security",
    },
    "manager": {
        "overview.view",
        "calendar.view",
        "calendar.manage",
        "bookings.view",
        "bookings.manage",
        "services.view",
        "services.manage",
        "team.view",
        "customers.view",
        "customers.notes",
        "products.manage",
        "orders.manage",
        "finance.view",
        "marketing.manage",
        "settings.profile",
        "settings.policies",
        "settings.payments",
    },
    "employee": {
        "overview.view",
        "calendar.view",
        "bookings.view",
        "services.view",
        "customers.view",
    },
    "receptionist": {
        "overview.view",
        "calendar.view",
        "calendar.manage",
        "bookings.view",
        "bookings.manage",
        "services.view",
        "customers.view",
    },
    "accountant": {
        "overview.view",
        "customers.view",
        "orders.manage",
        "finance.view",
        "finance.manage",
    },
}


def has_permission(role: str, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, set())


async def get_active_membership(
    db: AsyncSession,
    user_id: str,
    business_id: str,
) -> Membership | None:
    stmt = select(Membership).where(
        Membership.user_id == user_id,
        Membership.business_id == business_id,
        Membership.status == "active",
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def require_business_permission(
    db: AsyncSession,
    user: User,
    business_id: str,
    permission: str,
) -> tuple[Business, Membership | None]:
    business = await db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    if user.is_platform_admin:
        return business, None

    membership = await get_active_membership(db, user.id, business_id)
    if not membership:
        if business.owner_user_id == user.id:
            return business, None
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this business workspace",
        )

    if not has_permission(membership.role, permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permission: {permission}",
        )
    return business, membership


async def ensure_business_visible(
    db: AsyncSession,
    business_id: str,
    user: User | None,
) -> tuple[Business, bool]:
    """Return (business, is_privileged_member) or raise 404 if hidden/unapproved."""
    business = await db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    is_member = False
    if user:
        if user.is_platform_admin or business.owner_user_id == user.id:
            is_member = True
        else:
            membership = await get_active_membership(db, user.id, business.id)
            if membership:
                is_member = True

    if not is_member and (not business.is_public or business.status != "approved"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    return business, is_member
