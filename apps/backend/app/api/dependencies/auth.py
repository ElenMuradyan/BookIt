from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token, verify_csrf_token
from app.models.user import User

ACCESS_COOKIE_NAME = "bookit_access"
REFRESH_COOKIE_NAME = "bookit_refresh"
CSRF_COOKIE_NAME = "bookit_csrf"
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _extract_bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("authorization")
    if not auth_header:
        return None
    parts = auth_header.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


async def verify_csrf_if_cookie_auth(request: Request) -> None:
    if request.method not in MUTATING_METHODS:
        return
    # Bearer-authenticated requests (mobile/API clients) do not rely on ambient cookies
    if _extract_bearer_token(request):
        return
    # Only enforce CSRF if the browser sent an auth cookie
    has_auth_cookie = bool(
        request.cookies.get(ACCESS_COOKIE_NAME) or request.cookies.get(REFRESH_COOKIE_NAME)
    )
    if not has_auth_cookie:
        return
    cookie_csrf = request.cookies.get(CSRF_COOKIE_NAME)
    header_csrf = request.headers.get("x-csrf-token")
    if not verify_csrf_token(cookie_csrf, header_csrf):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token missing or invalid",
        )


async def get_optional_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User | None:
    token = _extract_bearer_token(request) or request.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not isinstance(user_id, str):
        return None
    user = await db.get(User, user_id)
    if not user or user.deactivated_at is not None or user.status != "active":
        return None
    return user


async def require_user(
    request: Request,
    _: Annotated[None, Depends(verify_csrf_if_cookie_auth)],
    user: Annotated[User | None, Depends(get_optional_user)],
) -> User:
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def require_platform_admin(
    user: Annotated[User, Depends(require_user)],
) -> User:
    if not user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform administrator access required",
        )
    return user
