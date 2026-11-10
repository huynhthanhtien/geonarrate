from datetime import datetime
from typing import Any, Protocol

from sqlalchemy import insert, select, update
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.schema import users
from app.core.transaction import connection
from app.models.user import Role, User
from app.repositories._ids import parse_uuid


class UserRepository(Protocol):
    async def get_by_email(self, email: str) -> User | None: ...
    async def get_by_id(self, user_id: str) -> User | None: ...
    async def insert(
        self, email: str, password_hash: str, roles: list[Role], full_name: str, now: datetime
    ) -> User: ...
    async def mark_login(self, user_id: str, now: datetime, password_hash: str | None) -> None: ...
    async def find_all(self) -> list[User]: ...
    async def update_fields(
        self, user_id: str, fields: dict[str, Any], now: datetime
    ) -> User | None: ...


class SqlUserRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def get_by_email(self, email: str) -> User | None:
        async with connection(self._engine) as conn:
            row = (
                (await conn.execute(select(users).where(users.c.email == email)))
                .mappings()
                .one_or_none()
            )
        return _to_entity(row) if row else None

    async def get_by_id(self, user_id: str) -> User | None:
        uid = parse_uuid(user_id)
        if uid is None:
            return None
        async with connection(self._engine) as conn:
            row = (
                (await conn.execute(select(users).where(users.c.id == uid)))
                .mappings()
                .one_or_none()
            )
        return _to_entity(row) if row else None

    async def insert(
        self, email: str, password_hash: str, roles: list[Role], full_name: str, now: datetime
    ) -> User:
        stmt = (
            insert(users)
            .values(
                email=email,
                password_hash=password_hash,
                full_name=full_name,
                roles=[role.value for role in roles],
                created_at=now,
                updated_at=now,
            )
            .returning(users)
        )
        async with connection(self._engine, write=True) as conn:
            row = (await conn.execute(stmt)).mappings().one()
        return _to_entity(row)

    async def mark_login(self, user_id: str, now: datetime, password_hash: str | None) -> None:
        """Ghi `last_login_at`; kèm hash mới nếu tham số argon2 đã đổi."""
        uid = parse_uuid(user_id)
        if uid is None:
            return
        values: dict[str, Any] = {"last_login_at": now}
        if password_hash:
            values |= {"password_hash": password_hash, "updated_at": now}
        async with connection(self._engine, write=True) as conn:
            await conn.execute(update(users).where(users.c.id == uid).values(**values))

    async def find_all(self) -> list[User]:
        async with connection(self._engine) as conn:
            rows = (await conn.execute(select(users).order_by(users.c.email))).mappings().all()
        return [_to_entity(r) for r in rows]

    async def update_fields(
        self, user_id: str, fields: dict[str, Any], now: datetime
    ) -> User | None:
        uid = parse_uuid(user_id)
        if uid is None:
            return None
        stmt = (
            update(users).where(users.c.id == uid).values(**fields, updated_at=now).returning(users)
        )
        async with connection(self._engine, write=True) as conn:
            row = (await conn.execute(stmt)).mappings().one_or_none()
        return _to_entity(row) if row else None


def _to_entity(row: RowMapping) -> User:
    return User(
        id=str(row["id"]),
        email=row["email"],
        password_hash=row["password_hash"],
        roles=tuple(Role(role) for role in row["roles"]),
        full_name=row["full_name"],
        is_active=row["is_active"],
        last_login_at=row["last_login_at"],
    )
