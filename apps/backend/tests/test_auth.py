import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from app.core.rate_limit import auth_rate_limiter
from app.core.security import create_access_token, create_csrf_token, decode_access_token, verify_csrf_token


@pytest.mark.asyncio
async def test_register_login_me_and_validation(client: AsyncClient):
    # Weak password rejected cleanly with 422 fieldErrors
    bad = await client.post(
        "/api/v1/auth/register",
        json={
            "firstName": "Test",
            "lastName": "User",
            "username": "testuser1",
            "email": "weak@example.com",
            "phone": "+1 206 555 0199",
            "password": "weak",
            "confirmPassword": "weak",
            "acceptTerms": True,
        },
    )
    assert bad.status_code == 422
    assert "fieldErrors" in bad.json()

    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "firstName": "Maya",
            "lastName": "Lin",
            "username": "mayalin",
            "email": "maya@example.com",
            "phone": "+1 206 555 0199",
            "password": "StrongPassword1!",
            "confirmPassword": "StrongPassword1!",
            "acceptTerms": True,
            "personalizationConsent": True,
        },
    )
    assert reg.status_code == 201, reg.text
    body = reg.json()
    assert body["user"]["email"] == "maya@example.com"
    assert "passwordHash" not in body["user"]
    access = body["accessToken"]

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 200
    assert me.json()["user"]["username"] == "mayalin"
    assert me.json()["profile"]["personalizationConsent"] is True


@pytest.mark.asyncio
async def test_refresh_rotation_and_reuse_detection(client: AsyncClient):
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"identifier": "customer@bookit.demo", "password": "Demo1234!", "remember": True},
    )
    assert login_res.status_code == 200
    refresh_1 = login_res.json()["refreshToken"]

    # Rotate once -> succeeds and issues refresh_2
    r1 = await client.post("/api/v1/auth/refresh", json={"refreshToken": refresh_1})
    assert r1.status_code == 200
    refresh_2 = r1.json()["refreshToken"]
    assert refresh_2 != refresh_1

    # Replay old refresh_1 -> MUST detect reuse and revoke the whole session family!
    replay = await client.post("/api/v1/auth/refresh", json={"refreshToken": refresh_1})
    assert replay.status_code == 401

    # Subsequent attempt with refresh_2 must ALSO fail because the entire family was revoked
    after_revocation = await client.post("/api/v1/auth/refresh", json={"refreshToken": refresh_2})
    assert after_revocation.status_code == 401


@pytest.mark.asyncio
async def test_expired_access_token_rejected(client: AsyncClient):
    expired_token, _ = create_access_token("usr_elena", expires_minutes=-5)
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert resp.status_code == 401


def test_verify_csrf_token_hmac_and_format():
    token = create_csrf_token("rfs_session_a")
    assert verify_csrf_token(token, token, session_hint="rfs_session_a") is True

    # Modified signature, wrong session, malformed format, missing, and non-ASCII must fail
    nonce, sig = token.split(".")
    tampered_sig = f"{nonce}.{('0' if sig[0] != '0' else '1')}{sig[1:]}"
    assert verify_csrf_token(tampered_sig, tampered_sig, session_hint="rfs_session_a") is False
    assert verify_csrf_token(token, token, session_hint="rfs_session_b") is False
    assert verify_csrf_token(token, token, session_hint="") is False
    assert verify_csrf_token(None, token, session_hint="rfs_session_a") is False
    assert verify_csrf_token(token, None, session_hint="rfs_session_a") is False
    assert verify_csrf_token("nodot", "nodot", session_hint="rfs_session_a") is False
    assert verify_csrf_token("a.b.c", "a.b.c", session_hint="rfs_session_a") is False
    assert verify_csrf_token(f".{sig}", f".{sig}", session_hint="rfs_session_a") is False
    assert verify_csrf_token(f"{nonce}.short", f"{nonce}.short", session_hint="rfs_session_a") is False
    assert verify_csrf_token("tök.1234", "tök.1234", session_hint="rfs_session_a") is False


@pytest.mark.asyncio
async def test_web_cookie_csrf_enforcement(client: AsyncClient):
    # Obtain a real signed CSRF token belonging to another session for cross-session rejection testing
    other_login = await client.post(
        "/api/v1/auth/login",
        headers={"X-Client-Type": "web"},
        json={"identifier": "business@bookit.demo", "password": "Demo1234!", "remember": True},
    )
    assert other_login.status_code == 200
    other_csrf = client.cookies.get("bookit_csrf")
    assert other_csrf
    client.cookies.clear()

    login_res = await client.post(
        "/api/v1/auth/login",
        headers={"X-Client-Type": "web"},
        json={"identifier": "customer@bookit.demo", "password": "Demo1234!", "remember": True},
    )
    assert login_res.status_code == 200
    data = login_res.json()
    # Web mode must not expose tokens in JSON body
    assert data["accessToken"] is None
    assert data["refreshToken"] is None
    csrf_cookie = client.cookies.get("bookit_csrf")
    assert csrf_cookie
    access_cookie = client.cookies.get("bookit_access")
    assert access_cookie
    refresh_cookie_1 = client.cookies.get("bookit_refresh")
    assert refresh_cookie_1

    def set_cookie(name: str, value: str | None, default_path: str = "/") -> None:
        matches = [(c.domain, c.path) for c in client.cookies.jar if c.name == name]
        domain, path = matches[0] if matches else ("testserver.local", default_path)
        for d, p in matches:
            client.cookies.delete(name, domain=d, path=p)
        if value is not None:
            client.cookies.set(name, value, domain=domain, path=path)

    # 1. Mutating cookie-auth request WITHOUT X-CSRF-Token must fail 403
    no_csrf = await client.put("/api/v1/users/me/theme", json={"theme": "light"})
    assert no_csrf.status_code == 403

    # 2. Modified signature (even when cookie == header) must fail 403
    nonce, sig = csrf_cookie.split(".")
    forged_csrf = f"{nonce}.{('0' if sig[0] != '0' else '1')}{sig[1:]}"
    set_cookie("bookit_csrf", forged_csrf)
    bad_sig = await client.put(
        "/api/v1/users/me/theme",
        headers={"X-CSRF-Token": forged_csrf},
        json={"theme": "light"},
    )
    assert bad_sig.status_code == 403

    # 3. Malformed CSRF token (even when cookie == header) must fail 403
    for malformed in ("malformed_no_dot", "a.b.c", f".{sig}", f"{nonce}.short"):
        set_cookie("bookit_csrf", malformed)
        bad_fmt = await client.put(
            "/api/v1/users/me/theme",
            headers={"X-CSRF-Token": malformed},
            json={"theme": "light"},
        )
        assert bad_fmt.status_code == 403

    # 4. Validly signed CSRF token bound to a DIFFERENT session must fail 403
    set_cookie("bookit_csrf", other_csrf)
    wrong_session = await client.put(
        "/api/v1/users/me/theme",
        headers={"X-CSRF-Token": other_csrf},
        json={"theme": "light"},
    )
    assert wrong_session.status_code == 403

    # 5. Missing bookit_csrf cookie (header present) must fail 403
    set_cookie("bookit_csrf", None)
    no_cookie = await client.put(
        "/api/v1/users/me/theme",
        headers={"X-CSRF-Token": csrf_cookie},
        json={"theme": "light"},
    )
    assert no_cookie.status_code == 403

    # 6. Restore valid cookie + matching X-CSRF-Token -> succeeds 200
    set_cookie("bookit_csrf", csrf_cookie)
    with_csrf = await client.put(
        "/api/v1/users/me/theme",
        headers={"X-CSRF-Token": csrf_cookie},
        json={"theme": "light"},
    )
    assert with_csrf.status_code == 200
    assert with_csrf.json()["theme"] == "light"

    # 7. Refresh after access token expires: wrong-session CSRF fails 403; valid CSRF refreshes + rotates!
    decoded = decode_access_token(access_cookie)
    assert decoded is not None and isinstance(decoded.get("sid"), str)
    expired_jwt, _ = create_access_token("usr_elena", session_id=decoded["sid"], expires_minutes=-5)
    set_cookie("bookit_access", expired_jwt)

    set_cookie("bookit_csrf", other_csrf)
    refresh_wrong_csrf = await client.post(
        "/api/v1/auth/refresh",
        headers={"X-Client-Type": "web", "X-CSRF-Token": other_csrf},
    )
    assert refresh_wrong_csrf.status_code == 403

    set_cookie("bookit_csrf", csrf_cookie)
    refresh_ok = await client.post(
        "/api/v1/auth/refresh",
        headers={"X-Client-Type": "web", "X-CSRF-Token": csrf_cookie},
    )
    assert refresh_ok.status_code == 200
    rotated_csrf = refresh_ok.cookies.get("bookit_csrf")
    rotated_refresh = refresh_ok.cookies.get("bookit_refresh")
    assert rotated_csrf and rotated_csrf != csrf_cookie
    assert rotated_refresh and rotated_refresh != refresh_cookie_1

    # Old CSRF token bound to pre-rotation session must fail against the rotated session
    set_cookie("bookit_csrf", csrf_cookie)
    stale_csrf_mut = await client.put(
        "/api/v1/users/me/theme",
        headers={"X-CSRF-Token": csrf_cookie},
        json={"theme": "dark"},
    )
    assert stale_csrf_mut.status_code == 403

    # Also verify refresh works when bookit_access cookie is completely absent (evicted after expiry)
    set_cookie("bookit_access", None)
    set_cookie("bookit_csrf", rotated_csrf)
    refresh_no_access = await client.post(
        "/api/v1/auth/refresh",
        headers={"X-Client-Type": "web", "X-CSRF-Token": rotated_csrf},
    )
    assert refresh_no_access.status_code == 200
    latest_csrf = refresh_no_access.cookies.get("bookit_csrf")
    assert latest_csrf and latest_csrf != rotated_csrf

    # 8. Logout without valid CSRF fails 403 and MUST NOT revoke session
    logout_bad = await client.post(
        "/api/v1/auth/logout",
        headers={"X-Client-Type": "web", "X-CSRF-Token": csrf_cookie},
    )
    assert logout_bad.status_code == 403
    still_active = await client.get("/api/v1/auth/me")
    assert still_active.status_code == 200

    # Logout with valid CSRF succeeds 200 and revokes session
    logout_ok = await client.post(
        "/api/v1/auth/logout",
        headers={"X-Client-Type": "web", "X-CSRF-Token": latest_csrf},
    )
    assert logout_ok.status_code == 200
    after_logout = await client.get("/api/v1/auth/me")
    assert after_logout.status_code == 401


@pytest.mark.asyncio
async def test_mobile_bearer_requests_do_not_require_csrf(client: AsyncClient):
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"identifier": "customer@bookit.demo", "password": "Demo1234!", "remember": False},
    )
    assert login_res.status_code == 200
    access = login_res.json()["accessToken"]
    assert access
    assert client.cookies.get("bookit_csrf") is None

    # Mutating Bearer request without CSRF cookie or X-CSRF-Token succeeds
    res = await client.put(
        "/api/v1/users/me/theme",
        headers={"Authorization": f"Bearer {access}"},
        json={"theme": "light"},
    )
    assert res.status_code == 200
    assert res.json()["theme"] == "light"


@pytest.mark.asyncio
async def test_password_reset_anti_enumeration_and_deactivation(client: AsyncClient):
    # Unknown and known identifiers return identical 200 payload
    r_unknown = await client.post("/api/v1/auth/password-reset/request", json={"identifier": "nobody@example.com"})
    r_known = await client.post("/api/v1/auth/password-reset/request", json={"identifier": "customer@bookit.demo"})
    assert r_unknown.status_code == 200
    assert r_known.status_code == 200
    assert r_unknown.json() == r_known.json()

    # Deactivate account revokes access immediately
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"identifier": "customer@bookit.demo", "password": "Demo1234!", "remember": False},
    )
    access = login_res.json()["accessToken"]
    deact = await client.post("/api/v1/auth/deactivate", headers={"Authorization": f"Bearer {access}"})
    assert deact.status_code == 200

    blocked_me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert blocked_me.status_code == 401


@pytest.mark.asyncio
async def test_auth_rate_limiting(client: AsyncClient):
    settings = get_settings()
    old = settings.auth_rate_limit_max_attempts
    settings.auth_rate_limit_max_attempts = 3
    await auth_rate_limiter.reset()
    try:
        for _ in range(3):
            r = await client.post(
                "/api/v1/auth/login",
                json={"identifier": "customer@bookit.demo", "password": "WrongPassword1!"},
            )
            assert r.status_code == 401
        r4 = await client.post(
            "/api/v1/auth/login",
            json={"identifier": "customer@bookit.demo", "password": "WrongPassword1!"},
        )
        assert r4.status_code == 429
    finally:
        settings.auth_rate_limit_max_attempts = old
        await auth_rate_limiter.reset()
