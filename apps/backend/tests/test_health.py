import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_endpoints(client: AsyncClient):
    r1 = await client.get("/health")
    assert r1.status_code == 200
    assert r1.json()["status"] == "ok"
    assert r1.json()["database"] == "connected"

    r2 = await client.get("/api/v1/health")
    assert r2.status_code == 200
    assert r2.json()["database"] == "connected"
    assert "X-Request-ID" in r2.headers
    assert r2.headers["X-Content-Type-Options"] == "nosniff"
    assert r2.headers["X-Frame-Options"] == "DENY"
