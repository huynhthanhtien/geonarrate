from datetime import datetime
from typing import Any

from sqlalchemy import delete, func, insert, literal_column, select, update
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from app.core.schema import audio_packs, pois, tour_pois, tours
from app.core.transaction import connection
from app.repositories._ids import parse_uuid, record

_COUNT = (
    select(func.count())
    .where(tour_pois.c.tour_id == tours.c.id)
    .scalar_subquery()
    .label("poi_count")
)


class SqlTourRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def find(self, status: str | None = None) -> list[dict[str, Any]]:
        stmt = select(tours, _COUNT).order_by(tours.c.updated_at.desc())
        if status:
            stmt = stmt.where(tours.c.status == status)
        async with connection(self._engine) as conn:
            return [record(r) for r in (await conn.execute(stmt)).mappings().all()]

    async def get(self, tour_id: str) -> dict[str, Any] | None:
        uid = parse_uuid(tour_id)
        if uid is None:
            return None
        async with connection(self._engine) as conn:
            row = (
                (await conn.execute(select(tours, _COUNT).where(tours.c.id == uid)))
                .mappings()
                .one_or_none()
            )
            if row is None:
                return None
            out = record(row)
            out["pois"] = await self._points(conn, uid)
        return out

    @staticmethod
    async def _points(conn: AsyncConnection, uid: Any) -> list[dict[str, Any]]:
        stmt = (
            select(
                pois.c.id,
                pois.c.title.label("name"),
                pois.c.summary,
                pois.c.images,
                pois.c.trigger_radius_m.label("radius"),
                pois.c.priority,
                pois.c.script,
                literal_column("ST_Y(pois.geo::geometry)").label("lat"),
                literal_column("ST_X(pois.geo::geometry)").label("lng"),
                tour_pois.c.position,
                tour_pois.c.is_preview,
            )
            .select_from(tour_pois.join(pois, tour_pois.c.poi_id == pois.c.id))
            .where(tour_pois.c.tour_id == uid)
            .order_by(tour_pois.c.position)
        )
        return [record(r) for r in (await conn.execute(stmt)).mappings().all()]

    async def count_existing(self, poi_ids: list[str]) -> int:
        ids = [parse_uuid(i) for i in poi_ids]
        stmt = select(func.count()).select_from(pois).where(pois.c.id.in_(ids))
        async with connection(self._engine) as conn:
            return int((await conn.execute(stmt)).scalar_one())

    async def save(
        self,
        tour_id: str | None,
        fields: dict[str, Any],
        points: list[dict[str, Any]] | None,
        actor_id: str,
        now: datetime,
    ) -> str:
        """Thêm hoặc sửa tour cùng danh sách điểm, rồi tính lại bbox trong một transaction."""
        values = {**fields, "updated_by": parse_uuid(actor_id), "updated_at": now}
        async with connection(self._engine, write=True) as conn:
            if tour_id is None:
                uid = (
                    await conn.execute(
                        insert(tours).values(**values, created_at=now).returning(tours.c.id)
                    )
                ).scalar_one()
            else:
                uid = parse_uuid(tour_id)
                await conn.execute(update(tours).where(tours.c.id == uid).values(**values))
            if points is not None:
                await conn.execute(delete(tour_pois).where(tour_pois.c.tour_id == uid))
                await conn.execute(
                    insert(tour_pois),
                    [
                        {
                            "tour_id": uid,
                            "poi_id": parse_uuid(p["id"]),
                            "position": i,
                            "is_preview": p["is_preview"],
                        }
                        for i, p in enumerate(points)
                    ],
                )
                box: Any = (
                    await conn.execute(
                        select(
                            func.min(literal_column("ST_X(a.geo::geometry)")),
                            func.min(literal_column("ST_Y(a.geo::geometry)")),
                            func.max(literal_column("ST_X(a.geo::geometry)")),
                            func.max(literal_column("ST_Y(a.geo::geometry)")),
                        )
                        .select_from(pois.alias("a"))
                        .where(
                            literal_column("a.id").in_(
                                select(tour_pois.c.poi_id).where(tour_pois.c.tour_id == uid)
                            )
                        )
                    )
                ).one()
                await conn.execute(update(tours).where(tours.c.id == uid).values(bbox=list(box)))
        return str(uid)

    async def published_langs(self, tour_id: str) -> list[str]:
        stmt = select(audio_packs.c.lang).where(
            audio_packs.c.tour_id == parse_uuid(tour_id), audio_packs.c.status == "published"
        )
        async with connection(self._engine) as conn:
            return list((await conn.execute(stmt)).scalars())
