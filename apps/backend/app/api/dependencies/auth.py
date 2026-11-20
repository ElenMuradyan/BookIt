from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token, hash_token, verify_csrf_token
from app.models.base import utc_now
from app.models.user import RefreshSession, User

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


async def _resolve_cookie_session_id(request: Request, db: AsyncSession) -> str | None:
    refresh_cookie = request.cookies.get(REFRESH_COOKIE_NAME)
    if refresh_cookie:
        row = (
            await db.execute(
                select(RefreshSession).where(RefreshSession.token_hash == hash_token(refresh_cookie))
            )
        ).scalar_one_or_none()
        return row.id if row else None

    access_cookie = request.cookies.get(ACCESS_COOKIE_NAME)
    if access_cookie:
        payload = decode_access_token(access_cookie, verify_exp=False)
        if not payload:
            return None
        sid = payload.get("sid")
        return sid if isinstance(sid, str) and sid else None

    return None


async def verify_csrf_if_cookie_auth(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
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
    session_id = await _resolve_cookie_session_id(request, db)
    cookie_csrf = request.cookies.get(CSRF_COOKIE_NAME)
    header_csrf = request.headers.get("x-csrf-token")
    if not session_id or not verify_csrf_token(cookie_csrf, header_csrf, session_hint=session_id):
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
    sid = payload.get("sid")
    if not isinstance(user_id, str) or not isinstance(sid, str):
        return None
    session_row = await db.get(RefreshSession, sid)
    if (
        not session_row
        or session_row.user_id != user_id
        or session_row.revoked_at is not None
        or session_row.expires_at <= utc_now()
    ):
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
