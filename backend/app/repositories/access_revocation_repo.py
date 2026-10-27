from datetime import datetime
from typing import Protocol

from redis.asyncio import Redis


class AccessRevocationRepository(Protocol):
    async def set_cutoff(self, user_id: str, cutoff: datetime, ttl_s: int) -> None: ...
    async def get_cutoff(self, user_id: str) -> float | None: ...


class RedisAccessRevocationRepository:
    """Mốc thu hồi access token theo user: token phát hành trước mốc này bị từ chối.

    Access token là JWT không trạng thái nên không xoá được; key chỉ cần sống bằng tuổi
    access token — quá thời gian đó mọi token cũ đã tự hết hạn.
    """

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def set_cutoff(self, user_id: str, cutoff: datetime, ttl_s: int) -> None:
        await self._redis.set(_key(user_id), cutoff.timestamp(), ex=ttl_s)

    async def get_cutoff(self, user_id: str) -> float | None:
        value = await self._redis.get(_key(user_id))
        return float(value) if value is not None else None


def _key(user_id: str) -> str:
    return f"auth:access_cutoff:{user_id}"
