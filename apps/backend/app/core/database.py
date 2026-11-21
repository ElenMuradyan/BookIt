import ssl
from collections.abc import AsyncGenerator
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import pool, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def prepare_async_database_url(raw_url: str) -> tuple[str, dict[str, Any]]:
    """
    Normalize PostgreSQL URLs for asyncpg + Neon compatibility:
    - Rewrites postgres:// and postgresql:// schemes to postgresql+asyncpg://
    - Translates libpq query params (sslmode, channel_binding) into asyncpg connect_args['ssl']
    """
    normalized = raw_url.strip()
    if normalized.startswith("postgres://"):
        normalized = "postgresql+asyncpg://" + normalized[len("postgres://") :]
    elif normalized.startswith("postgresql://"):
        normalized = "postgresql+asyncpg://" + normalized[len("postgresql://") :]

    parts = urlsplit(normalized)
    query_pairs = parse_qsl(parts.query, keep_blank_values=True)
    connect_args: dict[str, Any] = {}
    filtered_query: list[tuple[str, str]] = []

    for key, value in query_pairs:
        lowered = key.lower()
        if lowered == "sslmode":
            mode = value.strip().lower()
            if mode in ("verify-ca", "verify-full"):
                connect_args["ssl"] = ssl.create_default_context()
            elif mode in ("require", "prefer"):
                connect_args["ssl"] = "require"
            elif mode == "disable":
                connect_args["ssl"] = False
            continue
        if lowered == "channel_binding":
            # asyncpg rejects channel_binding as an unexpected connect() keyword argument
            continue
        filtered_query.append((key, value))

    clean_url = urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(filtered_query),
            parts.fragment,
        )
    )
    return clean_url, connect_args


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        settings = get_settings()
        db_url, connect_args = prepare_async_database_url(settings.database_url)
        engine_kwargs: dict[str, Any] = {
            "echo": settings.debug,
            "pool_pre_ping": True,
            "connect_args": connect_args,
        }
        if settings.db_use_null_pool:
            engine_kwargs["poolclass"] = pool.NullPool
        else:
            engine_kwargs["pool_size"] = settings.db_pool_size
            engine_kwargs["max_overflow"] = settings.db_max_overflow
            engine_kwargs["pool_recycle"] = settings.db_pool_recycle

        _engine = create_async_engine(db_url, **engine_kwargs)
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _session_factory


async def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def check_db_health() -> bool:
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(text("SELECT 1"))
        return result.scalar_one() == 1
