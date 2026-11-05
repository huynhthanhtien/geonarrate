import asyncio
from collections.abc import Awaitable, Callable
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from app.core.config import get_settings

ALEMBIC_INI = Path(__file__).parents[2] / "alembic.ini"


def alembic_config() -> Config:
    return Config(ALEMBIC_INI)


@pytest.fixture(scope="session", autouse=True)
def migrated_schema() -> None:
    command.upgrade(alembic_config(), "head")


def run_sql[T](fn: Callable[[AsyncConnection], Awaitable[T]]) -> T:
    """Chạy một transaction trên engine riêng, không đụng event loop của app đang test."""

    async def _main() -> T:
        engine = create_async_engine(get_settings().database_url)
        try:
            async with engine.begin() as conn:
                return await fn(conn)
        finally:
            await engine.dispose()

    return asyncio.run(_main())
