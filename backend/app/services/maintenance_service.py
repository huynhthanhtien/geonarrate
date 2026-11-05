import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from app.repositories.maintenance_repo import MaintenanceRepository

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class MaintenanceService:
    """Dọn dữ liệu hết hạn: PostgreSQL không có TTL index như MongoDB.

    Nhiều instance cùng chạy cũng an toàn vì DELETE lặp lại không gây hại.
    """

    def __init__(
        self,
        repo: MaintenanceRepository,
        playback_retention_days: int,
        clock: Callable[[], datetime] = _utcnow,
    ) -> None:
        self._repo = repo
        self._playback_retention = timedelta(days=playback_retention_days)
        self._clock = clock

    async def purge_expired(self) -> tuple[int, int]:
        """Trả về số (refresh token, playback event) đã xoá."""
        now = self._clock()
        tokens = await self._repo.delete_expired_refresh_tokens(now)
        events = await self._repo.delete_playback_events_before(now - self._playback_retention)
        return tokens, events

    async def run_forever(self, interval_s: float) -> None:
        """Chạy tới khi bị huỷ; một lần lỗi (vd. mất kết nối DB) không được dừng vòng lặp."""
        while True:
            try:
                await self.purge_expired()
            except Exception:
                logger.exception("Dọn dữ liệu hết hạn thất bại, sẽ thử lại ở chu kỳ sau")
            await asyncio.sleep(interval_s)
