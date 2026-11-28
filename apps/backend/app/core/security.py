import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

_password_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=19456,
    parallelism=1,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, plain_password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _password_hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_opaque_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def generate_six_digit_code() -> str:
    return f"{secrets.randbelow(900000) + 100000}"


def create_access_token(
    user_id: str,
    *,
    is_platform_admin: bool = False,
    session_id: str | None = None,
    expires_minutes: int | None = None,
) -> tuple[str, int]:
    settings = get_settings()
    ttl_minutes = expires_minutes or settings.access_token_expire_minutes
    now = datetime.now(UTC)
    exp = now + timedelta(minutes=ttl_minutes)
    payload: dict[str, Any] = {
        "sub": user_id,
        "type": "access",
        "jti": secrets.token_hex(12),
        "adm": is_platform_admin,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    if session_id:
        payload["sid"] = session_id
    encoded = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return encoded, ttl_minutes * 60


def decode_access_token(token: str, *, verify_exp: bool = True) -> dict[str, Any] | None:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={
                "verify_exp": verify_exp,
                "require": ["sub", "exp", "type", "jti"],
            },
        )
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload


def create_csrf_token(session_hint: str = "") -> str:
    settings = get_settings()
    nonce = secrets.token_urlsafe(24)
    sig = hmac.new(
        settings.csrf_secret_key.encode("utf-8"),
        f"{nonce}.{session_hint}".encode(),
        hashlib.sha256,
    ).hexdigest()[:24]
    return f"{nonce}.{sig}"


def verify_csrf_token(
    cookie_token: str | None,
    header_token: str | None,
    session_hint: str = "",
) -> bool:
    if not cookie_token or not header_token or not session_hint:
        return False
    if not cookie_token.isascii() or not header_token.isascii():
        return False
    if not hmac.compare_digest(cookie_token, header_token):
        return False
    parts = cookie_token.split(".")
    if len(parts) != 2:
        return False
    nonce, provided_sig = parts
    if not nonce or nonce != nonce.strip() or len(provided_sig) != 24:
        return False
    settings = get_settings()
    expected_sig = hmac.new(
        settings.csrf_secret_key.encode("utf-8"),
        f"{nonce}.{session_hint}".encode(),
        hashlib.sha256,
    ).hexdigest()[:24]
    return hmac.compare_digest(expected_sig, provided_sig)


def verify_hmac_signature(payload: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    cleaned = signature_header.removeprefix("sha256=").strip()
    return hmac.compare_digest(expected, cleaned)


def verify_stripe_signature(
    payload: bytes,
    signature_header: str | None,
    secret: str | None,
    *,
    tolerance_seconds: int = 300,
    now_ts: int | None = None,
) -> bool:
    if not signature_header or not secret:
        return False

    timestamp_str: str | None = None
    v1_signatures: list[str] = []
    for part in signature_header.split(","):
        item = part.strip()
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        if key == "t":
            timestamp_str = value.strip()
        elif key == "v1":
            v1_signatures.append(value.strip())

    if not timestamp_str or not v1_signatures:
        return False
    try:
        timestamp = int(timestamp_str)
    except ValueError:
        return False

    ref_ts = now_ts if now_ts is not None else int(datetime.now(UTC).timestamp())
    if tolerance_seconds > 0 and abs(ref_ts - timestamp) > tolerance_seconds:
        return False

    signed_payload = timestamp_str.encode("utf-8") + b"." + payload
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, sig) for sig in v1_signatures)

