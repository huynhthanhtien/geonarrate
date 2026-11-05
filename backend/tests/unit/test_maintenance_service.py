import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.services.maintenance_service import MaintenanceService

NOW = datetime(2026, 11, 5, tzinfo=UTC)


class FakeRepo:
    def __init__(self, fail_first: bool = False) -> None:
        self.succeeded = asyncio.Event()
        self.token_cutoffs: list[datetime] = []
        self.event_cutoffs: list[datetime] = []
        self._fail = fail_first

    async def delete_expired_refresh_tokens(self, now: datetime) -> int:
        if self._fail:
            self._fail = False
            raise ConnectionError("db down")
        self.token_cutoffs.append(now)
        self.succeeded.set()
        return 2

    async def delete_playback_events_before(self, cutoff: datetime) -> int:
        self.event_cutoffs.append(cutoff)
        return 3


async def test_purge_uses_retention_window() -> None:
    repo = FakeRepo()
    svc = MaintenanceService(repo, 180, clock=lambda: NOW)
    assert await svc.purge_expired() == (2, 3)
    assert repo.token_cutoffs == [NOW]
    assert repo.event_cutoffs == [NOW - timedelta(days=180)]


async def test_run_forever_survives_failure_and_stops_on_cancel() -> None:
    repo = FakeRepo(fail_first=True)
    svc = MaintenanceService(repo, 180, clock=lambda: NOW)
    task = asyncio.create_task(svc.run_forever(0))
    await asyncio.wait_for(repo.succeeded.wait(), timeout=1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
