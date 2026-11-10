from datetime import datetime
from typing import Any, Protocol

from sqlalchemy import case, cast, func, literal_column, select, update
from sqlalchemy.dialects.postgresql import JSONB, insert
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.schema import pois
from app.core.transaction import connection
from app.models.poi import Poi, ScriptStatus
from app.repositories._ids import parse_uuid
from app.repositories.job_repo import add_jobs

_t = pois
_SCRIPT_STATUS = func.coalesce(_t.c.script["status"].astext, ScriptStatus.DRAFT.value)
_COLUMNS = (
    *(c for c in _t.c if c.name != "geo"),
    literal_column("ST_Y(geo::geometry)").label("lat"),
    literal_column("ST_X(geo::geometry)").label("lng"),
)
_MAX_LIST = 500


class PoiRepository(Protocol):
    async def find_all(self, category: str | None, script_status: str | None) -> list[Poi]: ...
    async def get(self, poi_id: str) -> Poi | None: ...
    async def insert(
        self,
        name: str,
        category: str,
        priority: int,
        lat: float,
        lng: float,
        radius: int,
        script: str,
        summary: str | None,
        images: list[str],
        actor_id: str,
        now: datetime,
    ) -> Poi: ...
    async def update_info(
        self, poi_id: str, fields: dict[str, Any], actor_id: str, now: datetime
    ) -> Poi | None: ...
    async def update_script(
        self,
        poi_id: str,
        expected_status: ScriptStatus,
        patch: dict[str, Any],
        actor_id: str,
        now: datetime,
        jobs: list[dict[str, Any]] | None = None,
    ) -> Poi | None: ...


class SqlPoiRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def find_all(self, category: str | None, script_status: str | None) -> list[Poi]:
        stmt = (
            select(*_COLUMNS)
            .order_by(_t.c.status, _t.c.updated_at.desc(), _t.c.id)
            .limit(_MAX_LIST)
        )
        if category:
            stmt = stmt.where(_t.c.category == category)
        if script_status:
            stmt = stmt.where(_SCRIPT_STATUS == script_status)
        async with connection(self._engine) as conn:
            rows = (await conn.execute(stmt)).mappings().all()
        return [_to_entity(row) for row in rows]

    async def get(self, poi_id: str) -> Poi | None:
        uid = parse_uuid(poi_id)
        if uid is None:
            return None
        async with connection(self._engine) as conn:
            row = (
                (await conn.execute(select(*_COLUMNS).where(_t.c.id == uid)))
                .mappings()
                .one_or_none()
            )
        return _to_entity(row) if row else None

    async def insert(
        self,
        name: str,
        category: str,
        priority: int,
        lat: float,
        lng: float,
        radius: int,
        script: str,
        summary: str | None,
        images: list[str],
        actor_id: str,
        now: datetime,
    ) -> Poi:
        actor = parse_uuid(actor_id)
        stmt = (
            insert(_t)
            .values(
                title=name,
                summary=summary,
                images=images,
                category=category,
                priority=priority,
                geo=f"SRID=4326;POINT({lng} {lat})",
                trigger_radius_m=radius,
                script={
                    "version": 1,
                    "body": script,
                    "status": ScriptStatus.DRAFT.value,
                    "review_note": None,
                    "reviewed_by": None,
                    "reviewed_at": None,
                },
                status="draft",
                created_by=actor,
                updated_by=actor,
                created_at=now,
                updated_at=now,
            )
            .returning(*_COLUMNS)
        )
        async with connection(self._engine, write=True) as conn:
            row = (await conn.execute(stmt)).mappings().one()
        return _to_entity(row)

    async def update_info(
        self, poi_id: str, fields: dict[str, Any], actor_id: str, now: datetime
    ) -> Poi | None:
        """Sửa thông tin điểm. Không có điểm thì trả về `None`."""
        uid = parse_uuid(poi_id)
        if uid is None:
            return None
        values = dict(fields)
        if "name" in values:
            values["title"] = values.pop("name")
        if "radius" in values:
            values["trigger_radius_m"] = values.pop("radius")
        if "lat" in values:
            values["geo"] = f"SRID=4326;POINT({values.pop('lng')} {values.pop('lat')})"
        stmt = (
            update(_t)
            .where(_t.c.id == uid)
            .values(**values, updated_by=parse_uuid(actor_id), updated_at=now)
            .returning(*_COLUMNS)
        )
        async with connection(self._engine, write=True) as conn:
            row = (await conn.execute(stmt)).mappings().one_or_none()
        return _to_entity(row) if row else None

    async def update_script(
        self,
        poi_id: str,
        expected_status: ScriptStatus,
        patch: dict[str, Any],
        actor_id: str,
        now: datetime,
        jobs: list[dict[str, Any]] | None = None,
    ) -> Poi | None:
        """Cập nhật nguyên tử theo trạng thái: hai người cùng duyệt thì chỉ một người thắng.

        Trả về `None` nếu không có điểm này hoặc script không còn ở `expected_status`.
        """
        uid = parse_uuid(poi_id)
        if uid is None:
            return None
        script_object = case(
            (func.jsonb_typeof(_t.c.script) == "object", _t.c.script),
            else_=cast({}, JSONB),
        )
        stmt = (
            update(_t)
            .where(_t.c.id == uid, _SCRIPT_STATUS == expected_status.value)
            .values(
                script=script_object.op("||", return_type=JSONB)(cast(patch, JSONB)),
                updated_by=parse_uuid(actor_id),
                updated_at=now,
            )
            .returning(*_COLUMNS)
        )
        async with connection(self._engine, write=True) as conn:
            row = (await conn.execute(stmt)).mappings().one_or_none()
            if row and jobs:
                await add_jobs(conn, jobs, actor_id, now)
        return _to_entity(row) if row else None


def _to_entity(row: RowMapping) -> Poi:
    script = row["script"] if isinstance(row["script"], dict) else {}
    return Poi(
        id=str(row["id"]),
        name=row["title"],
        summary=row["summary"],
        images=row["images"],
        lat=row["lat"],
        lng=row["lng"],
        radius=row["trigger_radius_m"],
        category=row["category"],
        priority=row["priority"],
        script=script.get("body") or "",
        script_status=ScriptStatus(script.get("status") or ScriptStatus.DRAFT.value),
        script_version=script.get("version") or 1,
        review_note=script.get("review_note"),
        created_by=str(row["created_by"]) if row["created_by"] else None,
        updated_by=str(row["updated_by"]) if row["updated_by"] else None,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
