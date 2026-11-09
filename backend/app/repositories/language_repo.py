from typing import Protocol

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.schema import languages
from app.core.transaction import connection
from app.models.language import Language


class LanguageRepository(Protocol):
    async def list_active(self) -> list[Language]: ...
    async def upsert(self, lang: Language) -> None: ...


class SqlLanguageRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def list_active(self) -> list[Language]:
        stmt = select(languages).where(languages.c.is_active).order_by(languages.c.code)
        async with connection(self._engine) as conn:
            rows = (await conn.execute(stmt)).mappings().all()
        return [_to_entity(row) for row in rows]

    async def upsert(self, lang: Language) -> None:
        values = {
            "bcp47": lang.bcp47,
            "native_name": lang.native_name,
            "is_source": lang.is_source,
            "is_active": lang.is_active,
        }
        stmt = (
            insert(languages)
            .values(code=lang.code, **values)
            .on_conflict_do_update(index_elements=[languages.c.code], set_=values)
        )
        async with connection(self._engine, write=True) as conn:
            await conn.execute(stmt)


def _to_entity(row: RowMapping) -> Language:
    return Language(
        code=row["code"],
        bcp47=row["bcp47"],
        native_name=row["native_name"],
        is_source=row["is_source"],
        is_active=row["is_active"],
    )
