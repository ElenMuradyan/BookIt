import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

os.environ["ENVIRONMENT"] = "test"
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://bookit:bookit_dev_password@localhost:5432/bookit_test",
)

from app.core.config import get_settings
from app.core.database import dispose_engine, get_db
from app.core.rate_limit import auth_rate_limiter
from app.main import app
from app.models import Base
from scripts.seed import seed_database


@pytest.fixture(scope="session", autouse=True)
def configure_test_settings():
    get_settings.cache_clear()
    settings = get_settings()
    settings.database_url = os.environ["DATABASE_URL"]
    settings.auth_rate_limit_max_attempts = 100
    yield


@pytest_asyncio.fixture(scope="function")
async def db_engine():
    settings = get_settings()
    engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()
    await dispose_engine()


@pytest_asyncio.fixture(scope="function")
async def session_factory(db_engine) -> async_sessionmaker[AsyncSession]:
    factory = async_sessionmaker(bind=db_engine, class_=AsyncSession, expire_on_commit=False, autoflush=False)
    async with factory() as session:
        await seed_database(session)
    return factory


@pytest_asyncio.fixture(scope="function")
async def db_session(session_factory) -> AsyncGenerator[AsyncSession, None]:
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def client(session_factory) -> AsyncGenerator[AsyncClient, None]:
    await auth_rate_limiter.reset()

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.clear()


async def login_as(client: AsyncClient, identifier: str, password: str = "Demo1234!") -> dict:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": password, "remember": True},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()
