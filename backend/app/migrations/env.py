import asyncio
from typing import Any

from alembic import context
from sqlalchemy import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.core.schema import metadata

# Bảng do extension PostGIS tạo, không thuộc schema của ứng dụng
_POSTGIS_TABLES = {"spatial_ref_sys"}


def _include_object(_obj: Any, name: str | None, type_: str, _reflected: bool, _to: Any) -> bool:
    return not (type_ == "table" and name in _POSTGIS_TABLES)


def _run(connection: Connection) -> None:
    # Image postgis thêm schema tiger, topology vào search_path: chỉ đối chiếu với public
    connection.exec_driver_sql("SET search_path TO public")
    context.configure(
        connection=connection,
        target_metadata=metadata,
        include_object=_include_object,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def _run_online() -> None:
    engine = create_async_engine(get_settings().database_url)
    async with engine.connect() as conn:
        await conn.run_sync(_run)
        await conn.commit()
    await engine.dispose()


if context.is_offline_mode():
    raise RuntimeError("Migration chỉ chạy online: cần kết nối PostgreSQL")
asyncio.run(_run_online())
