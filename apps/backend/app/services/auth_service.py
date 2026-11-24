import logging
from datetime import timedelta
from html import escape
from urllib.parse import urlencode

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_csrf_token,
    generate_opaque_token,
    generate_six_digit_code,
    hash_password,
    hash_token,
    needs_rehash,
    verify_password,
)
from app.models.base import new_id, utc_now
from app.models.business import Business, Membership
from app.models.commerce import Cart
from app.models.user import AuditLog, CustomerProfile, RefreshSession, User, VerificationToken
from app.schemas.auth import (
    AuthSessionOut,
    CustomerProfileOut,
    NotificationPreferencesOut,
    RegisterIn,
    UserOut,
    WorkspaceOut,
)
from app.services.notification_service import schedule_email_notification, send_email_notification

logger = logging.getLogger("bookit.auth")
MAX_VERIFICATION_FAILED_ATTEMPTS = 5


def build_verification_email_content(*, code: str, link_token: str) -> tuple[str, str, str]:
    settings = get_settings()
    base_url = settings.frontend_base_url.rstrip("/")
    verify_url = f"{base_url}/verify?{urlencode({'token': link_token})}"
    subject = "Verify your BookIt email"
    text_body = (
        "Welcome to BookIt.\n\n"
        f"Your 6-digit verification code is: {code}\n\n"
        f"Or verify with a single click using this link (expires in 24 hours):\n{verify_url}\n"
    )
    safe_url = escape(verify_url, quote=True)
    safe_code = escape(code)
    html_body = (
        "<div style=\"font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827;\">"
        "<h2 style=\"margin:0 0 12px;\">Verify your BookIt email</h2>"
        "<p style=\"margin:0 0 16px;line-height:1.5;\">Enter this 6-digit verification code in BookIt:</p>"
        f"<p style=\"font-size:28px;font-weight:700;letter-spacing:6px;margin:0 0 20px;\">{safe_code}</p>"
        "<p style=\"margin:0 0 16px;line-height:1.5;\">Or verify directly with the button below (valid for 24 hours, single use):</p>"
        f"<p style=\"margin:0 0 20px;\"><a href=\"{safe_url}\" style=\"display:inline-block;padding:12px 20px;background:#6d28d9;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;\">Verify email address</a></p>"
        f"<p style=\"font-size:12px;color:#6b7280;word-break:break-all;\">Direct link: {safe_url}</p>"
        "</div>"
    )
    return subject, text_body, html_body


def build_password_reset_email_content(*, code: str) -> tuple[str, str, str]:
    subject = "Reset your BookIt password"
    text_body = (
        "We received a request to reset your BookIt password.\n\n"
        f"Your 6-digit password reset code is: {code}\n\n"
        "This code expires in 30 minutes. If you did not request a password reset, you can ignore this email.\n"
    )
    safe_code = escape(code)
    html_body = (
        "<div style=\"font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827;\">"
        "<h2 style=\"margin:0 0 12px;\">Reset your BookIt password</h2>"
        "<p style=\"margin:0 0 16px;line-height:1.5;\">Enter this 6-digit password reset code in BookIt:</p>"
        f"<p style=\"font-size:28px;font-weight:700;letter-spacing:6px;margin:0 0 20px;\">{safe_code}</p>"
        "<p style=\"margin:0 0 12px;font-size:13px;color:#4b5563;\">This code expires in 30 minutes and locks after 5 incorrect attempts.</p>"
        "<p style=\"margin:0;font-size:12px;color:#6b7280;\">If you did not request this change, you can safely ignore this message.</p>"
        "</div>"
    )
    return subject, text_body, html_body


async def send_verification_email(
    *,
    to_email: str,
    code: str,
    link_token: str,
) -> str | None:
    subject, text_body, html_body = build_verification_email_content(code=code, link_token=link_token)
    return await send_email_notification(
        to_email=to_email,
        subject=subject,
        body=text_body,
        html_body=html_body,
    )


async def send_password_reset_email(
    *,
    to_email: str,
    code: str,
) -> str | None:
    subject, text_body, html_body = build_password_reset_email_content(code=code)
    return await send_email_notification(
        to_email=to_email,
        subject=subject,
        body=text_body,
        html_body=html_body,
    )


def enqueue_verification_email(
    background_tasks: BackgroundTasks,
    *,
    to_email: str,
    code: str,
    link_token: str,
) -> None:
    subject, text_body, html_body = build_verification_email_content(code=code, link_token=link_token)
    schedule_email_notification(
        background_tasks,
        to_email=to_email,
        subject=subject,
        body=text_body,
        html_body=html_body,
    )


async def record_audit(
    db: AsyncSession,
    *,
    actor_user_id: str | None,
    action: str,
    target_type: str,
    target_id: str,
    ip_address: str | None = None,
    details: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            ip_address=ip_address,
            details=details or {},
        )
    )


async def user_workspaces(db: AsyncSession, user_id: str) -> list[WorkspaceOut]:
    stmt = (
        select(Membership, Business)
        .join(Business, Business.id == Membership.business_id)
        .where(Membership.user_id == user_id, Membership.status != "suspended")
    )
    rows = (await db.execute(stmt)).all()
    return [
        WorkspaceOut(
            business_id=membership.business_id,
            business_name=business.name,
            role=membership.role,
            status=membership.status,
            category=business.category,
            city=business.city,
        )
        for membership, business in rows
    ]


def serialize_profile(profile: CustomerProfile | None) -> CustomerProfileOut | None:
    if not profile:
        return None
    prefs = profile.notification_preferences or {}
    return CustomerProfileOut(
        user_id=profile.user_id,
        interests=profile.interests or [],
        language=profile.language,
        marketing_opt_in=profile.marketing_opt_in,
        personalization_consent=profile.personalization_consent,
        consent_updated_at=profile.consent_updated_at,
        spending_visibility=profile.spending_visibility,  # type: ignore[arg-type]
        theme=profile.theme,  # type: ignore[arg-type]
        notification_preferences=NotificationPreferencesOut(**prefs),
    )


async def find_user_by_identifier(db: AsyncSession, identifier: str) -> User | None:
    cleaned = identifier.strip()
    if not cleaned:
        return None
    lowered = cleaned.lower()
    unique_stmt = select(User).where(or_(User.email == lowered, User.username == lowered))
    user = (await db.execute(unique_stmt)).scalar_one_or_none()
    if user is not None:
        return user
    phone_matches = (await db.execute(select(User).where(User.phone == cleaned).limit(2))).scalars().all()
    if len(phone_matches) == 1:
        return phone_matches[0]
    return None


async def _issue_session_tokens(
    db: AsyncSession,
    user: User,
    *,
    remember: bool,
    user_agent: str | None,
    ip_address: str | None,
    family_id: str | None = None,
    business_id: str | None = None,
) -> tuple[AuthSessionOut, str]:
    settings = get_settings()
    raw_refresh = generate_opaque_token(48)
    ttl_days = settings.refresh_token_expire_days if remember else 1
    session_row = RefreshSession(
        id=new_id("rfs"),
        user_id=user.id,
        family_id=family_id or new_id("fam"),
        token_hash=hash_token(raw_refresh),
        user_agent=(user_agent or "")[:512] or None,
        ip_address=ip_address,
        expires_at=utc_now() + timedelta(days=ttl_days),
    )
    db.add(session_row)
    await db.flush()

    access_token, expires_in = create_access_token(
        user.id,
        is_platform_admin=user.is_platform_admin,
        session_id=session_row.id,
    )
    csrf_token = create_csrf_token(session_row.id)
    profile = await db.get(CustomerProfile, user.id)
    workspaces = await user_workspaces(db, user.id)

    payload = AuthSessionOut(
        user_id=user.id,
        business_id=business_id or (workspaces[0].business_id if workspaces else None),
        expires_in=expires_in,
        access_token=access_token,
        refresh_token=raw_refresh,
        csrf_token=csrf_token,
        user=UserOut.model_validate(user),
        profile=serialize_profile(profile),
        workspaces=workspaces,
    )
    return payload, raw_refresh


async def register_customer(
    db: AsyncSession,
    data: RegisterIn,
    *,
    user_agent: str | None,
    ip_address: str | None,
    commit: bool = True,
) -> tuple[AuthSessionOut, str, str, str]:
    email = data.email.strip().lower()
    username = data.username.strip().lower()

    existing = (
        await db.execute(
            select(User).where(or_(User.email == email, User.username == username))
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already uses that email or username",
        )

    now = utc_now()
    user = User(
        id=new_id("usr"),
        first_name=data.first_name.strip(),
        last_name=data.last_name.strip(),
        username=username,
        email=email,
        phone=data.phone.strip(),
        password_hash=hash_password(data.password),
        date_of_birth=data.date_of_birth or None,
        gender=data.gender or None,
        location=data.location or None,
        language=data.language or "English",
        interests=data.interests,
        email_verified=False,
        phone_verified=False,
        status="active",
        is_platform_admin=False,
    )
    profile = CustomerProfile(
        user_id=user.id,
        interests=data.interests,
        language=data.language or "English",
        marketing_opt_in=False,
        personalization_consent=bool(data.personalization_consent),
        consent_updated_at=now if data.personalization_consent else None,
        spending_visibility="recorded_only",
        theme="dark",
    )
    cart = Cart(id=new_id("cart"), user_id=user.id)
    verification_code = generate_six_digit_code()
    verification_link_token = generate_opaque_token(32)
    verify_otp_row = VerificationToken(
        user_id=user.id,
        purpose="email_verify",
        token_hash=hash_token(f"{user.id}:email_verify:{verification_code}"),
        expires_at=now + timedelta(hours=24),
    )
    verify_link_row = VerificationToken(
        user_id=user.id,
        purpose="email_verify_link",
        token_hash=hash_token(f"email_verify_link:{verification_link_token}"),
        expires_at=now + timedelta(hours=24),
    )

    try:
        db.add(user)
        await db.flush()
        db.add_all([profile, cart, verify_otp_row, verify_link_row])
        await record_audit(
            db,
            actor_user_id=user.id,
            action="auth.register",
            target_type="user",
            target_id=user.id,
            ip_address=ip_address,
        )
        session_out, raw_refresh = await _issue_session_tokens(
            db,
            user,
            remember=True,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        if commit:
            await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already uses that email or username",
        ) from exc
    return session_out, raw_refresh, verification_code, verification_link_token


async def authenticate_user(
    db: AsyncSession,
    identifier: str,
    password: str,
    *,
    remember: bool,
    require_workspace: bool,
    user_agent: str | None,
    ip_address: str | None,
) -> tuple[AuthSessionOut, str]:
    user = await find_user_by_identifier(db, identifier)
    if not user or not verify_password(password, user.password_hash):
        await record_audit(
            db,
            actor_user_id=user.id if user else None,
            action="auth.login_failed",
            target_type="user",
            target_id=user.id if user else identifier[:64],
            ip_address=ip_address,
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect",
        )

    if user.deactivated_at is not None or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is suspended or deactivated",
        )

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)

    workspaces = await user_workspaces(db, user.id)
    if require_workspace and not workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account does not have a business workspace yet. Sign in as a customer or register a business.",
        )

    await record_audit(
        db,
        actor_user_id=user.id,
        action="auth.login",
        target_type="user",
        target_id=user.id,
        ip_address=ip_address,
        details={"workspace_login": require_workspace},
    )
    session_out, raw_refresh = await _issue_session_tokens(
        db,
        user,
        remember=remember,
        user_agent=user_agent,
        ip_address=ip_address,
        business_id=workspaces[0].business_id if workspaces else None,
    )
    await db.commit()
    return session_out, raw_refresh


async def rotate_refresh_session(
    db: AsyncSession,
    raw_refresh_token: str,
    *,
    user_agent: str | None,
    ip_address: str | None,
) -> tuple[AuthSessionOut, str, bool]:
    token_digest = hash_token(raw_refresh_token)
    stmt = (
        select(RefreshSession)
        .where(RefreshSession.token_hash == token_digest)
        .with_for_update()
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    now = utc_now()
    if existing.revoked_at is not None:
        # Refresh token reuse detected -> revoke entire token family immediately!
        logger.warning(
            "Refresh token reuse detected; revoking family",
            extra={"user_id": existing.user_id},
        )
        await db.execute(
            update(RefreshSession)
            .where(RefreshSession.family_id == existing.family_id, RefreshSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await record_audit(
            db,
            actor_user_id=existing.user_id,
            action="auth.refresh_reuse_revoked",
            target_type="refresh_family",
            target_id=existing.family_id,
            ip_address=ip_address,
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked due to token reuse")

    if existing.expires_at <= now:
        existing.revoked_at = now
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh session expired")

    user = await db.get(User, existing.user_id)
    if not user or user.deactivated_at is not None or user.status != "active":
        existing.revoked_at = now
        await db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account inactive")

    remember = (existing.expires_at - existing.created_at) > timedelta(days=2)
    session_out, new_raw_refresh = await _issue_session_tokens(
        db,
        user,
        remember=remember,
        user_agent=user_agent,
        ip_address=ip_address,
        family_id=existing.family_id,
    )
    new_session_digest = hash_token(new_raw_refresh)
    new_row = (
        await db.execute(select(RefreshSession).where(RefreshSession.token_hash == new_session_digest))
    ).scalar_one()
    existing.revoked_at = now
    existing.replaced_by_id = new_row.id
    await db.commit()
    return session_out, new_raw_refresh, remember


async def revoke_refresh_token(db: AsyncSession, raw_refresh_token: str | None, user_id: str | None = None) -> None:
    now = utc_now()
    if raw_refresh_token:
        digest = hash_token(raw_refresh_token)
        await db.execute(
            update(RefreshSession)
            .where(RefreshSession.token_hash == digest, RefreshSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
    elif user_id:
        await db.execute(
            update(RefreshSession)
            .where(RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
    await db.commit()


async def verify_email_code(
    db: AsyncSession,
    *,
    code: str,
    authenticated_user: User | None = None,
    identifier: str | None = None,
) -> User:
    target_user: User | None = authenticated_user
    cleaned_identifier = (identifier or "").strip()
    if target_user is None:
        if not cleaned_identifier:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Provide your account email or sign in to verify",
            )
        target_user = await find_user_by_identifier(db, cleaned_identifier)
    elif cleaned_identifier:
        resolved = await find_user_by_identifier(db, cleaned_identifier)
        if not resolved or resolved.id != target_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="That code does not match or has expired",
            )

    if not target_user or target_user.deactivated_at is not None or target_user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That code does not match or has expired",
        )

    now = utc_now()
    digest = hash_token(f"{target_user.id}:email_verify:{code.strip()}")
    latest_stmt = (
        select(VerificationToken)
        .where(
            VerificationToken.user_id == target_user.id,
            VerificationToken.purpose == "email_verify",
            VerificationToken.consumed_at.is_(None),
            VerificationToken.expires_at > now,
        )
        .order_by(VerificationToken.created_at.desc())
        .limit(1)
        .with_for_update()
    )
    tok = (await db.execute(latest_stmt)).scalar_one_or_none()
    if not tok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That code does not match or has expired")

    if tok.token_hash != digest:
        tok.failed_attempts = (tok.failed_attempts or 0) + 1
        if tok.failed_attempts >= MAX_VERIFICATION_FAILED_ATTEMPTS:
            tok.consumed_at = now
            await db.execute(
                update(VerificationToken)
                .where(
                    VerificationToken.user_id == target_user.id,
                    VerificationToken.purpose.in_(("email_verify", "email_verify_link")),
                    VerificationToken.consumed_at.is_(None),
                )
                .values(consumed_at=now)
            )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That code does not match or has expired")

    tok.consumed_at = now
    await db.execute(
        update(VerificationToken)
        .where(
            VerificationToken.user_id == target_user.id,
            VerificationToken.purpose.in_(("email_verify", "email_verify_link")),
            VerificationToken.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )
    target_user.email_verified = True
    await record_audit(
        db,
        actor_user_id=target_user.id,
        action="auth.email_verified",
        target_type="user",
        target_id=target_user.id,
        details={"method": "otp"},
    )
    await db.commit()
    return target_user


async def verify_email_link_token(db: AsyncSession, raw_token: str) -> User:
    cleaned = raw_token.strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification link is invalid or has expired",
        )
    now = utc_now()
    digest = hash_token(f"email_verify_link:{cleaned}")
    stmt = (
        select(VerificationToken)
        .where(
            VerificationToken.purpose == "email_verify_link",
            VerificationToken.token_hash == digest,
            VerificationToken.consumed_at.is_(None),
            VerificationToken.expires_at > now,
        )
        .order_by(VerificationToken.created_at.desc())
        .with_for_update()
    )
    tok = (await db.execute(stmt)).scalar_one_or_none()
    if not tok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification link is invalid or has expired",
        )

    user = await db.get(User, tok.user_id)
    if not user or user.deactivated_at is not None or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification link is invalid or has expired",
        )

    tok.consumed_at = now
    await db.execute(
        update(VerificationToken)
        .where(
            VerificationToken.user_id == user.id,
            VerificationToken.purpose.in_(("email_verify", "email_verify_link")),
            VerificationToken.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )
    user.email_verified = True
    await record_audit(
        db,
        actor_user_id=user.id,
        action="auth.email_verified",
        target_type="user",
        target_id=user.id,
        details={"method": "link"},
    )
    await db.commit()
    return user


async def issue_email_verification(
    db: AsyncSession,
    user: User,
    *,
    enforce_cooldown_error: bool = True,
    commit: bool = True,
) -> tuple[str, str] | None:
    settings = get_settings()
    now = utc_now()
    latest_stmt = (
        select(VerificationToken)
        .where(
            VerificationToken.user_id == user.id,
            VerificationToken.purpose == "email_verify",
        )
        .order_by(VerificationToken.created_at.desc())
        .limit(1)
    )
    latest = (await db.execute(latest_stmt)).scalar_one_or_none()
    cooldown = settings.verification_resend_cooldown_seconds
    if latest is not None and cooldown > 0:
        elapsed = (now - latest.created_at).total_seconds()
        if elapsed < cooldown:
            if enforce_cooldown_error:
                wait_seconds = max(1, int(cooldown - elapsed))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Please wait {wait_seconds} seconds before requesting a new verification email.",
                    headers={"Retry-After": str(wait_seconds)},
                )
            return None

    await db.execute(
        update(VerificationToken)
        .where(
            VerificationToken.user_id == user.id,
            VerificationToken.purpose.in_(("email_verify", "email_verify_link")),
            VerificationToken.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )

    code = generate_six_digit_code()
    link_token = generate_opaque_token(32)
    db.add_all(
        [
            VerificationToken(
                user_id=user.id,
                purpose="email_verify",
                token_hash=hash_token(f"{user.id}:email_verify:{code}"),
                expires_at=now + timedelta(hours=24),
            ),
            VerificationToken(
                user_id=user.id,
                purpose="email_verify_link",
                token_hash=hash_token(f"email_verify_link:{link_token}"),
                expires_at=now + timedelta(hours=24),
            ),
        ]
    )
    await record_audit(
        db,
        actor_user_id=user.id,
        action="auth.verification_sent",
        target_type="user",
        target_id=user.id,
    )
    if commit:
        await db.commit()
    return code, link_token



async def request_password_reset_token(
    db: AsyncSession,
    identifier: str,
    *,
    commit: bool = True,
) -> tuple[str, str] | None:
    """Anti-enumeration: callers always receive the same generic 200 message."""
    user = await find_user_by_identifier(db, identifier)
    if not user or user.deactivated_at is not None or user.status != "active":
        return None
    now = utc_now()
    await db.execute(
        update(VerificationToken)
        .where(
            VerificationToken.user_id == user.id,
            VerificationToken.purpose == "password_reset",
            VerificationToken.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )
    code = generate_six_digit_code()
    db.add(
        VerificationToken(
            user_id=user.id,
            purpose="password_reset",
            token_hash=hash_token(f"{user.id}:password_reset:{code}"),
            expires_at=now + timedelta(minutes=30),
        )
    )
    await record_audit(
        db,
        actor_user_id=user.id,
        action="auth.password_reset_requested",
        target_type="user",
        target_id=user.id,
    )
    if commit:
        await db.commit()
    return user.email, code


async def confirm_password_reset_token(
    db: AsyncSession,
    identifier: str,
    code: str,
    new_password: str,
) -> None:
    user = await find_user_by_identifier(db, identifier)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset code")
    now = utc_now()
    digest = hash_token(f"{user.id}:password_reset:{code.strip()}")
    latest_stmt = (
        select(VerificationToken)
        .where(
            VerificationToken.user_id == user.id,
            VerificationToken.purpose == "password_reset",
            VerificationToken.consumed_at.is_(None),
            VerificationToken.expires_at > now,
        )
        .order_by(VerificationToken.created_at.desc())
        .limit(1)
        .with_for_update()
    )
    tok = (await db.execute(latest_stmt)).scalar_one_or_none()
    if not tok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset code")
    if tok.token_hash != digest:
        tok.failed_attempts = (tok.failed_attempts or 0) + 1
        if tok.failed_attempts >= MAX_VERIFICATION_FAILED_ATTEMPTS:
            tok.consumed_at = now
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset code")
    tok.consumed_at = now
    user.password_hash = hash_password(new_password)
    # Revoke all existing refresh sessions on password reset
    await db.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await record_audit(
        db,
        actor_user_id=user.id,
        action="auth.password_reset_completed",
        target_type="user",
        target_id=user.id,
    )
    await db.commit()


async def change_user_password(
    db: AsyncSession,
    user: User,
    current_password: str,
    new_password: str,
) -> None:
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    now = utc_now()
    user.password_hash = hash_password(new_password)
    await db.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await record_audit(
        db,
        actor_user_id=user.id,
        action="auth.password_changed",
        target_type="user",
        target_id=user.id,
    )
    await db.commit()


async def deactivate_user_account(db: AsyncSession, user: User) -> None:
    now = utc_now()
    user.status = "suspended"
    user.deactivated_at = now
    await db.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await record_audit(
        db,
        actor_user_id=user.id,
        action="auth.account_deactivated",
        target_type="user",
        target_id=user.id,
    )
    await db.commit()
