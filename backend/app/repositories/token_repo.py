from datetime import datetime
from typing import Protocol

from sqlalchemy import insert, select, update
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.schema import refresh_tokens
from app.models.user import RefreshToken
from app.repositories._ids import parse_uuid


class RefreshTokenRepository(Protocol):
    async def insert(
        self, user_id: str, token_hash: str, family_id: str, expires_at: datetime, now: datetime
    ) -> RefreshToken: ...
    async def get_by_hash(self, token_hash: str) -> RefreshToken | None: ...
    async def revoke_if_active(self, token_hash: str, now: datetime) -> RefreshToken | None: ...
    async def revoke_family(self, family_id: str, now: datetime) -> None: ...
    async def revoke_all_for_user(self, user_id: str, now: datetime) -> None: ...


class SqlRefreshTokenRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def insert(
        self, user_id: str, token_hash: str, family_id: str, expires_at: datetime, now: datetime
    ) -> RefreshToken:
        stmt = (
            insert(refresh_tokens)
            .values(
                user_id=parse_uuid(user_id),
                token_hash=token_hash,
                family_id=family_id,
                expires_at=expires_at,
                created_at=now,
            )
            .returning(refresh_tokens)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(stmt)).mappings().one()
        return _to_entity(row)

    async def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        stmt = select(refresh_tokens).where(refresh_tokens.c.token_hash == token_hash)
        async with self._engine.connect() as conn:
            row = (await conn.execute(stmt)).mappings().one_or_none()
        return _to_entity(row) if row else None

    async def revoke_if_active(self, token_hash: str, now: datetime) -> RefreshToken | None:
        """Thu hồi nguyên tử: hai request refresh cùng token thì chỉ một request thắng."""
        stmt = (
            update(refresh_tokens)
            .where(refresh_tokens.c.token_hash == token_hash, refresh_tokens.c.revoked_at.is_(None))
            .values(revoked_at=now)
            .returning(refresh_tokens)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(stmt)).mappings().one_or_none()
        return _to_entity(row) if row else None

    async def revoke_family(self, family_id: str, now: datetime) -> None:
        stmt = (
            update(refresh_tokens)
            .where(refresh_tokens.c.family_id == family_id, refresh_tokens.c.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        async with self._engine.begin() as conn:
            await conn.execute(stmt)

    async def revoke_all_for_user(self, user_id: str, now: datetime) -> None:
        uid = parse_uuid(user_id)
        if uid is None:
            return
        stmt = (
            update(refresh_tokens)
            .where(refresh_tokens.c.user_id == uid, refresh_tokens.c.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        async with self._engine.begin() as conn:
            await conn.execute(stmt)


def _to_entity(row: RowMapping) -> RefreshToken:
    return RefreshToken(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        token_hash=row["token_hash"],
        family_id=row["family_id"],
        expires_at=row["expires_at"],
        revoked_at=row["revoked_at"],
    )
