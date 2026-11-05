from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.config import get_settings

_engine: AsyncEngine | None = None


async def connect() -> None:
    global _engine
    _engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)


async def disconnect() -> None:
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None


def get_engine() -> AsyncEngine:
    if _engine is None:
        raise RuntimeError("PostgreSQL chưa kết nối")
    return _engine


async def ping() -> None:
    async with get_engine().connect() as conn:
        await conn.execute(text("SELECT 1"))
