from datetime import datetime
from typing import Protocol

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.schema import playback_events, refresh_tokens


class MaintenanceRepository(Protocol):
    async def delete_expired_refresh_tokens(self, now: datetime) -> int: ...
    async def delete_playback_events_before(self, cutoff: datetime) -> int: ...


class SqlMaintenanceRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def delete_expired_refresh_tokens(self, now: datetime) -> int:
        stmt = delete(refresh_tokens).where(refresh_tokens.c.expires_at <= now)
        async with self._engine.begin() as conn:
            return (await conn.execute(stmt)).rowcount

    async def delete_playback_events_before(self, cutoff: datetime) -> int:
        stmt = delete(playback_events).where(playback_events.c.ts < cutoff)
        async with self._engine.begin() as conn:
            return (await conn.execute(stmt)).rowcount
