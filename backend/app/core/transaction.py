"""Transaction theo yêu cầu CMS: thay đổi nghiệp vụ, job và audit cùng commit."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from contextvars import ContextVar

from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from app.core.database import get_engine

_active: ContextVar[tuple[AsyncEngine, AsyncConnection] | None] = ContextVar(
    "db_transaction", default=None
)


async def cms_transaction() -> AsyncIterator[None]:
    engine = get_engine()
    async with engine.begin() as conn:
        token = _active.set((engine, conn))
        try:
            yield
        finally:
            _active.reset(token)


@asynccontextmanager
async def connection(engine: AsyncEngine, *, write: bool = False) -> AsyncIterator[AsyncConnection]:
    active = _active.get()
    if active is not None and active[0] is engine:
        yield active[1]
    else:
        async with engine.begin() if write else engine.connect() as conn:
            yield conn
