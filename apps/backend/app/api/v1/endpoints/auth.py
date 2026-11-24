from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import (
    ACCESS_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    get_optional_user,
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
    VerifyResendIn,
    VerifyTokenIn,
)
from app.schemas.common import OkResponse
from app.services.auth_service import (
    authenticate_user,
    change_user_password,
    confirm_password_reset_token,
    deactivate_user_account,
    enqueue_verification_email as _send_verification_email,
    find_user_by_identifier,
    issue_email_verification,
    register_customer,
    request_password_reset_token,
    revoke_refresh_token,
    rotate_refresh_session,
    serialize_profile,
    user_workspaces,
    verify_email_code,
    verify_email_link_token,
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
    session_out, raw_refresh, verify_code, verify_link_token = await register_customer(
        db,
        payload,
        user_agent=request.headers.get("user-agent"),
        ip_address=ip,
    )
    _send_verification_email(
        background_tasks,
        to_email=payload.email.strip().lower(),
        code=verify_code,
        link_token=verify_link_token,
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
    await verify_csrf_if_cookie_auth(request, db)
    settings = get_settings()
    ip = client_ip_from_request(request)
    await auth_rate_limiter.check(
        f"refresh:{ip}",
        settings.auth_rate_limit_max_attempts * 2,
        settings.auth_rate_limit_window_seconds,
    )
    raw_token = (payload.refresh_token if payload else None) or request.cookies.get(REFRESH_COOKIE_NAME)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing")

    session_out, new_raw_refresh, remember = await rotate_refresh_session(
        db,
        raw_token,
        user_agent=request.headers.get("user-agent"),
        ip_address=ip,
    )
    return _set_session_cookies(
        request,
        response,
        session_out=session_out,
        raw_refresh=new_raw_refresh,
        remember=remember,
    )


@router.post("/logout", response_model=OkResponse)
async def logout(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
    payload: RefreshIn | None = None,
):
    await verify_csrf_if_cookie_auth(request, db)
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
@router.post("/verify/resend", response_model=OkResponse)
async def request_verification(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[None, Depends(verify_csrf_if_cookie_auth)],
    user: Annotated[User | None, Depends(get_optional_user)],
    payload: VerifyResendIn | None = None,
):
    settings = get_settings()
    ip = client_ip_from_request(request)
    requested_identifier = (
        (payload.email or payload.identifier or "").strip() if payload else ""
    )

    if user is not None and not requested_identifier:
        await auth_rate_limiter.check(
            f"verify-req:{user.id}:{ip}",
            min(settings.auth_rate_limit_max_attempts, 6),
            settings.auth_rate_limit_window_seconds,
        )
        if user.email_verified:
            return OkResponse(ok=True, message="Email is already verified")
        issued = await issue_email_verification(db, user, enforce_cooldown_error=True)
        if issued:
            code, link_token = issued
            _send_verification_email(
                background_tasks,
                to_email=user.email,
                code=code,
                link_token=link_token,
            )
        return OkResponse(ok=True, message="Verification email sent")

    if not requested_identifier:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide the account email to resend verification instructions",
        )

    await auth_rate_limiter.check(
        f"verify-req-pub:{ip}:{requested_identifier.lower()}",
        min(settings.auth_rate_limit_max_attempts, 6),
        settings.auth_rate_limit_window_seconds,
    )
    target = await find_user_by_identifier(db, requested_identifier)
    if (
        target is not None
        and target.deactivated_at is None
        and target.status == "active"
        and not target.email_verified
    ):
        issued = await issue_email_verification(db, target, enforce_cooldown_error=False)
        if issued:
            code, link_token = issued
            _send_verification_email(
                background_tasks,
                to_email=target.email,
                code=code,
                link_token=link_token,
            )
    # Anti-enumeration: identical 200 response for unknown, verified, cooldown, or unverified identifiers
    return OkResponse(
        ok=True,
        message="If an unverified account matches that email, verification instructions have been sent.",
    )


@router.post("/verify", response_model=OkResponse)
async def verify_contact(
    payload: VerifyContactIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[None, Depends(verify_csrf_if_cookie_auth)],
    user: Annotated[User | None, Depends(get_optional_user)],
):
    settings = get_settings()
    ip = client_ip_from_request(request)
    identifier = (payload.email or payload.identifier or "").strip() or None
    if user is None and not identifier:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide the account email or sign in before verifying",
        )

    rate_key = (
        f"verify:{user.id}:{ip}"
        if user is not None
        else f"verify-pub:{ip}:{identifier.lower() if identifier else ''}"
    )
    await auth_rate_limiter.check(
        rate_key,
        min(settings.auth_rate_limit_max_attempts, 6),
        settings.auth_rate_limit_window_seconds,
    )
    await verify_email_code(
        db,
        code=payload.code,
        authenticated_user=user,
        identifier=identifier,
    )
    return OkResponse(ok=True, message="Email verified")


@router.post("/verify-token", response_model=OkResponse)
async def verify_email_token(
    payload: VerifyTokenIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[None, Depends(verify_csrf_if_cookie_auth)],
):
    settings = get_settings()
    ip = client_ip_from_request(request)
    await auth_rate_limiter.check(
        f"verify-tok:{ip}",
        min(settings.auth_rate_limit_max_attempts, 8),
        settings.auth_rate_limit_window_seconds,
    )
    await verify_email_link_token(db, payload.token)
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
    reset_info = await request_password_reset_token(db, payload.identifier)
    if reset_info:
        target_email, code = reset_info
        schedule_email_notification(
            background_tasks,
            to_email=target_email,
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
        f"pwconfirm:{ip}:{payload.identifier.strip().lower()}",
        min(settings.auth_rate_limit_max_attempts, 6),
        settings.auth_rate_limit_window_seconds,
    )
    await confirm_password_reset_token(db, payload.identifier, payload.code, payload.password)
    return OkResponse(ok=True, message="Password updated")


@router.post("/change-password", response_model=OkResponse)
async def change_password(
    payload: ChangePasswordIn,
    request: Request,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    settings = get_settings()
    ip = client_ip_from_request(request)
    await auth_rate_limiter.check(
        f"chgpw:{user.id}:{ip}",
        min(settings.auth_rate_limit_max_attempts, 6),
        settings.auth_rate_limit_window_seconds,
    )
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
