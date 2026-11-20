from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import (
    ACCESS_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    require_user,
    verify_csrf_if_cookie_auth,
)
from app.core.config import get_settings
from app.core.database import get_db
from app.core.rate_limit import auth_rate_limiter, client_ip_from_request
from app.models.user import CustomerProfile, User
from app.schemas.auth import (
    AuthSessionOut,
    ChangePasswordIn,
    LoginIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    RefreshIn,
    RegisterIn,
    UserOut,
    VerifyContactIn,
)
from app.schemas.common import OkResponse
from app.services.auth_service import (
    authenticate_user,
    change_user_password,
    confirm_password_reset_token,
    deactivate_user_account,
    issue_email_verification,
    register_customer,
    request_password_reset_token,
    revoke_refresh_token,
    rotate_refresh_session,
    serialize_profile,
    user_workspaces,
    verify_email_code,
)
from app.services.notification_service import schedule_email_notification

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookies(
    request: Request,
    response: Response,
    *,
    session_out: AuthSessionOut,
    raw_refresh: str,
    remember: bool,
) -> AuthSessionOut:
    client_type = (request.headers.get("x-client-type") or "").lower()
    if client_type != "web":
        # Mobile & API Bearer clients use Authorization headers + refresh tokens in response JSON, never ambient cookies
        return session_out

    settings = get_settings()
    max_age_refresh = (settings.refresh_token_expire_days if remember else 1) * 86400
    cookie_kwargs = {
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
        "domain": settings.cookie_domain,
    }
    if session_out.access_token:
        response.set_cookie(
            key=ACCESS_COOKIE_NAME,
            value=session_out.access_token,
            httponly=True,
            max_age=session_out.expires_in,
            path="/",
            **cookie_kwargs,
        )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_refresh,
        httponly=True,
        max_age=max_age_refresh,
        path="/api/v1/auth",
        **cookie_kwargs,
    )
    if session_out.csrf_token:
        response.set_cookie(
            key=CSRF_COOKIE_NAME,
            value=session_out.csrf_token,
            httponly=False,
            max_age=max_age_refresh,
            path="/",
            **cookie_kwargs,
        )

    # Browser relies strictly on HttpOnly cookies + CSRF cookie
    return session_out.model_copy(update={"refresh_token": None, "access_token": None})


def _clear_session_cookies(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/", domain=settings.cookie_domain)
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/api/v1/auth", domain=settings.cookie_domain)
    response.delete_cookie(CSRF_COOKIE_NAME, path="/", domain=settings.cookie_domain)


@router.post("/register", response_model=AuthSessionOut, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterIn,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    settings = get_settings()
    ip = client_ip_from_request(request)
    await auth_rate_limiter.check(
        f"register:{ip}",
        settings.auth_rate_limit_max_attempts,
        settings.auth_rate_limit_window_seconds,
    )
    session_out, raw_refresh, verify_code = await register_customer(
        db,
        payload,
        user_agent=request.headers.get("user-agent"),
        ip_address=ip,
    )
    schedule_email_notification(
        background_tasks,
        to_email=payload.email,
        subject="Verify your BookIt email",
        body=f"Your verification code is {verify_code}.",
    )
    return _set_session_cookies(request, response, session_out=session_out, raw_refresh=raw_refresh, remember=True)


@router.post("/login", response_model=AuthSessionOut)
async def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    settings = get_settings()
    ip = client_ip_from_request(request)
    await auth_rate_limiter.check(
        f"login:{ip}:{payload.identifier.strip().lower()}",
        settings.auth_rate_limit_max_attempts,
        settings.auth_rate_limit_window_seconds,
    )
    session_out, raw_refresh = await authenticate_user(
        db,
        payload.identifier,
        payload.password,
        remember=payload.remember,
        require_workspace=False,
        user_agent=request.headers.get("user-agent"),
        ip_address=ip,
    )
    return _set_session_cookies(
        request,
        response,
        session_out=session_out,
        raw_refresh=raw_refresh,
        remember=payload.remember,
    )


@router.post("/login/business", response_model=AuthSessionOut)
async def login_business(
    payload: LoginIn,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    settings = get_settings()
    ip = client_ip_from_request(request)
    await auth_rate_limiter.check(
        f"login-biz:{ip}:{payload.identifier.strip().lower()}",
        settings.auth_rate_limit_max_attempts,
        settings.auth_rate_limit_window_seconds,
    )
    session_out, raw_refresh = await authenticate_user(
        db,
        payload.identifier,
        payload.password,
        remember=payload.remember,
        require_workspace=True,
        user_agent=request.headers.get("user-agent"),
        ip_address=ip,
    )
    return _set_session_cookies(
        request,
        response,
        session_out=session_out,
        raw_refresh=raw_refresh,
        remember=payload.remember,
    )


@router.post("/refresh", response_model=AuthSessionOut)
async def refresh_session(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
    payload: RefreshIn | None = None,
):
    await verify_csrf_if_cookie_auth(request)
    raw_token = (payload.refresh_token if payload else None) or request.cookies.get(REFRESH_COOKIE_NAME)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing")

    session_out, new_raw_refresh = await rotate_refresh_session(
        db,
        raw_token,
        user_agent=request.headers.get("user-agent"),
        ip_address=client_ip_from_request(request),
    )
    return _set_session_cookies(
        request,
        response,
        session_out=session_out,
        raw_refresh=new_raw_refresh,
        remember=True,
    )


@router.post("/logout", response_model=OkResponse)
async def logout(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
    payload: RefreshIn | None = None,
):
    await verify_csrf_if_cookie_auth(request)
    raw_token = (payload.refresh_token if payload else None) or request.cookies.get(REFRESH_COOKIE_NAME)
    await revoke_refresh_token(db, raw_token)
    _clear_session_cookies(response)
    return OkResponse(ok=True, message="Signed out")


@router.get("/me", response_model=AuthSessionOut)
async def me(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    profile = await db.get(CustomerProfile, user.id)
    workspaces = await user_workspaces(db, user.id)
    return AuthSessionOut(
        user_id=user.id,
        business_id=workspaces[0].business_id if workspaces else None,
        expires_in=get_settings().access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
        profile=serialize_profile(profile),
        workspaces=workspaces,
    )


@router.post("/verify/request", response_model=OkResponse)
async def request_verification(
    user: Annotated[User, Depends(require_user)],
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    code = await issue_email_verification(db, user)
    schedule_email_notification(
        background_tasks,
        to_email=user.email,
        subject="Your BookIt verification code",
        body=f"Verification code: {code}",
    )
    return OkResponse(ok=True, message="Verification code sent")


@router.post("/verify", response_model=OkResponse)
async def verify_contact(
    payload: VerifyContactIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await verify_email_code(db, user, payload.code)
    return OkResponse(ok=True, message="Email verified")


@router.post("/password-reset/request", response_model=OkResponse)
async def request_password_reset(
    payload: PasswordResetRequestIn,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    settings = get_settings()
    ip = client_ip_from_request(request)
    await auth_rate_limiter.check(
        f"pwreset:{ip}",
        settings.auth_rate_limit_max_attempts,
        settings.auth_rate_limit_window_seconds,
    )
    code = await request_password_reset_token(db, payload.identifier)
    if code:
        schedule_email_notification(
            background_tasks,
            to_email=payload.identifier,
            subject="BookIt password reset",
            body=f"Your password reset code is {code}.",
        )
    # Identical anti-enumeration response regardless of account existence
    return OkResponse(
        ok=True,
        message="If an account matches that identifier, reset instructions have been sent.",
    )


@router.post("/password-reset/confirm", response_model=OkResponse)
async def confirm_password_reset(
    payload: PasswordResetConfirmIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    settings = get_settings()
    ip = client_ip_from_request(request)
    await auth_rate_limiter.check(
        f"pwconfirm:{ip}",
        settings.auth_rate_limit_max_attempts,
        settings.auth_rate_limit_window_seconds,
    )
    await confirm_password_reset_token(db, payload.identifier, payload.code, payload.password)
    return OkResponse(ok=True, message="Password updated")


@router.post("/change-password", response_model=OkResponse)
async def change_password(
    payload: ChangePasswordIn,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await change_user_password(db, user, payload.current_password, payload.new_password)
    _clear_session_cookies(response)
    return OkResponse(ok=True, message="Password changed. Please sign in again.")


@router.post("/deactivate", response_model=OkResponse)
async def deactivate_account(
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await deactivate_user_account(db, user)
    _clear_session_cookies(response)
    return OkResponse(ok=True, message="Account deactivated")
