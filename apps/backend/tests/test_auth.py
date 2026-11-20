import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from app.core.rate_limit import auth_rate_limiter
from app.core.security import create_access_token


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


@pytest.mark.asyncio
async def test_web_cookie_csrf_enforcement(client: AsyncClient):
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

    # Mutating cookie-auth request WITHOUT X-CSRF-Token must fail 403
    no_csrf = await client.put("/api/v1/users/me/theme", json={"theme": "light"})
    assert no_csrf.status_code == 403

    # With matching X-CSRF-Token -> succeeds 200
    with_csrf = await client.put(
        "/api/v1/users/me/theme",
        headers={"X-CSRF-Token": csrf_cookie},
        json={"theme": "light"},
    )
    assert with_csrf.status_code == 200
    assert with_csrf.json()["theme"] == "light"


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
