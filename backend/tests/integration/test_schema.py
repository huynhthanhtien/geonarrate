"""Ràng buộc do CSDL đảm bảo và vòng đời migration."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, insert, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core import schema
from app.core.deps import get_maintenance_service
from app.main import app
from tests.integration.conftest import alembic_config, clear_test_pois, run_sql

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def clean_tables() -> Iterator[None]:
    """Xoá dữ liệu nghiệp vụ; `languages` giữ nguyên vì app seed khi khởi động."""

    async def _clean(conn: AsyncConnection) -> None:
        for table in (
            schema.playback_events,
            schema.ticket_tours,
            schema.tickets,
            schema.jobs,
            schema.audio_packs,
            schema.audio_assets,
            schema.translations,
            schema.glossaries,
            schema.tour_pois,
            schema.tours,
            schema.refresh_tokens,
            schema.audit_logs,
        ):
            await conn.execute(delete(table))
        await clear_test_pois(conn)
        # app seed ngôn ngữ khi khởi động; test chạy riêng lẻ vẫn cần có sẵn "vi"
        await conn.execute(
            pg_insert(schema.languages)
            .values(code="vi", bcp47="vi-VN", native_name="Tiếng Việt")
            .on_conflict_do_nothing()
        )

    run_sql(_clean)
    yield


def _poi(name: str, lat: float = 10.7797, lng: float = 106.6990) -> dict[str, Any]:
    return {
        "title": name,
        "category": "museum",
        "geo": f"SRID=4326;POINT({lng} {lat})",
        "trigger_radius_m": 40,
        "status": "active",
    }


def _insert_poi(name: str, **kw: float) -> UUID:
    async def _run(conn: AsyncConnection) -> UUID:
        stmt = insert(schema.pois).values(**_poi(name, **kw))
        result = await conn.execute(stmt.returning(schema.pois.c.id))
        return UUID(str(result.scalar_one()))

    return run_sql(_run)


def test_no_schema_drift_and_downgrade_roundtrip() -> None:
    cfg = alembic_config()
    command.check(cfg)  # schema.py và migration phải khớp nhau
    command.downgrade(cfg, "base")

    async def tables(conn: AsyncConnection) -> list[str]:
        rows = await conn.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        )
        return sorted(rows.scalars())

    assert run_sql(tables) == ["alembic_version", "spatial_ref_sys"]
    command.upgrade(cfg, "head")
    assert set(schema.metadata.tables) <= set(run_sql(tables))


def test_no_segment_columns_remain() -> None:
    for table in schema.metadata.tables.values():
        assert not [c.name for c in table.columns if "segment" in c.name], table.name


def test_tour_cannot_be_deleted_while_it_has_pois() -> None:
    poi = _insert_poi("protected-tour-poi")

    async def add_tour(conn: AsyncConnection) -> UUID:
        stmt = insert(schema.tours).values(name="Protected tour", status="draft", access="free")
        tour = UUID(str((await conn.execute(stmt.returning(schema.tours.c.id))).scalar_one()))
        await conn.execute(insert(schema.tour_pois).values(tour_id=tour, poi_id=poi, position=0))
        return tour

    tour = run_sql(add_tour)

    async def delete_tour(conn: AsyncConnection) -> None:
        await conn.execute(delete(schema.tours).where(schema.tours.c.id == tour))

    with pytest.raises(IntegrityError, match="fk_tour_pois_tour_id_tours"):
        run_sql(delete_tour)


def test_geo_lookup_uses_real_distance() -> None:
    near = _insert_poi("near", lat=10.7797, lng=106.6990)
    _insert_poi("far", lat=21.0285, lng=105.8542)  # Hà Nội

    async def within_100m(conn: AsyncConnection) -> list[UUID]:
        rows = await conn.execute(
            text(
                "SELECT id FROM pois WHERE ST_DWithin("
                "geo, ST_GeogFromText('SRID=4326;POINT(106.6995 10.7797)'), 100)"
            )
        )
        return list(rows.scalars())

    assert run_sql(within_100m) == [near]


def test_active_job_dedupe_allows_retry_after_finish() -> None:
    job = {"type": "tts", "dedupe_key": "audio:1:en:abc", "status": "queued"}

    async def first(conn: AsyncConnection) -> None:
        await conn.execute(insert(schema.jobs).values(**job))

    async def second(conn: AsyncConnection) -> None:
        await conn.execute(insert(schema.jobs).values(**job))

    async def finish(conn: AsyncConnection) -> None:
        await conn.execute(update(schema.jobs).values(status="succeeded"))

    run_sql(first)
    with pytest.raises(IntegrityError):
        run_sql(second)
    run_sql(finish)
    run_sql(second)  # job cũ đã xong thì được tạo lại


def test_global_glossary_terms_are_unique_despite_null() -> None:
    row = {"term": "Ngọ Môn", "target_lang": "vi", "translation": "Ngọ Môn"}

    async def add(conn: AsyncConnection) -> None:
        await conn.execute(insert(schema.glossaries).values(**row))

    run_sql(add)
    with pytest.raises(IntegrityError):
        run_sql(add)


def test_only_one_published_pack_per_tour_and_language() -> None:
    async def tour(conn: AsyncConnection) -> UUID:
        stmt = insert(schema.tours).values(name="t", status="draft", access="free")
        return UUID(str((await conn.execute(stmt.returning(schema.tours.c.id))).scalar_one()))

    tour_id = run_sql(tour)

    def add(version: int, status: str) -> None:
        async def _run(conn: AsyncConnection) -> None:
            await conn.execute(
                insert(schema.audio_packs).values(
                    tour_id=tour_id, lang="vi", version=version, status=status
                )
            )

        run_sql(_run)

    add(1, "published")
    add(2, "building")
    with pytest.raises(IntegrityError):
        add(3, "published")
    with pytest.raises(IntegrityError):
        add(2, "qa")  # trùng version


def test_user_role_and_tour_access_are_constrained() -> None:
    async def bad_role(conn: AsyncConnection) -> None:
        await conn.execute(
            insert(schema.users).values(email="x@test", password_hash="h", roles=["hacker"])
        )

    async def bad_access(conn: AsyncConnection) -> None:
        await conn.execute(insert(schema.tours).values(name="b", status="draft", access="vip"))

    with pytest.raises(IntegrityError):
        run_sql(bad_role)
    with pytest.raises(IntegrityError):
        run_sql(bad_access)


def test_deleting_poi_and_referenced_language_is_blocked() -> None:
    poi_id = _insert_poi("cascade")

    async def add_translation(conn: AsyncConnection) -> None:
        await conn.execute(
            insert(schema.translations).values(
                poi_id=poi_id,
                target_lang="vi",
                version=1,
                text="x",
                review_status="draft",
            )
        )

    async def delete_language(conn: AsyncConnection) -> None:
        await conn.execute(delete(schema.languages).where(schema.languages.c.code == "vi"))

    async def delete_poi(conn: AsyncConnection) -> None:
        await conn.execute(delete(schema.pois).where(schema.pois.c.id == poi_id))

    async def truncate_pois(conn: AsyncConnection) -> None:
        await conn.execute(text("TRUNCATE TABLE pois CASCADE"))

    async def remaining(conn: AsyncConnection) -> int:
        result = await conn.execute(select(func.count()).select_from(schema.translations))
        return result.scalar_one()

    run_sql(add_translation)
    with pytest.raises(IntegrityError):
        run_sql(delete_language)
    for operation in (delete_poi, truncate_pois):
        with pytest.raises(IntegrityError, match="Không được xóa cứng POI"):
            run_sql(operation)
    assert run_sql(remaining) == 1


def test_purge_replaces_mongo_ttl_indexes() -> None:
    """Token hết hạn và playback quá 180 ngày bị xoá; dữ liệu còn hạn được giữ."""
    now = datetime.now(UTC)
    poi_id = _insert_poi("purge")

    async def seed(conn: AsyncConnection) -> None:
        user_id = (
            await conn.execute(
                insert(schema.users)
                .values(email="purge@test", password_hash="h", roles=["editor"])
                .returning(schema.users.c.id)
            )
        ).scalar_one()
        for name, delta in (("old", -1), ("live", 1)):
            await conn.execute(
                insert(schema.refresh_tokens).values(
                    user_id=user_id,
                    token_hash=name,
                    family_id="f",
                    expires_at=now + timedelta(hours=delta),
                )
            )
        for name, days in (("old", 181), ("live", 179)):
            await conn.execute(
                insert(schema.playback_events).values(
                    device_id="d",
                    event_id=name,
                    poi_id=poi_id,
                    lang="vi",
                    event="play",
                    ts=now - timedelta(days=days),
                )
            )

    async def remaining(conn: AsyncConnection) -> tuple[list[str], list[str]]:
        tokens = await conn.execute(select(schema.refresh_tokens.c.token_hash))
        events = await conn.execute(select(schema.playback_events.c.event_id))
        await conn.execute(delete(schema.refresh_tokens))
        await conn.execute(delete(schema.users).where(schema.users.c.email == "purge@test"))
        return list(tokens.scalars()), list(events.scalars())

    run_sql(seed)
    with TestClient(app) as client:
        portal = client.portal
        assert portal is not None
        # lifespan cũng dọn ngay khi khởi động nên số đếm có thể đã về 0; chỉ kiểm tra kết quả
        portal.call(get_maintenance_service().purge_expired)
    assert run_sql(remaining) == (["live"], ["live"])
