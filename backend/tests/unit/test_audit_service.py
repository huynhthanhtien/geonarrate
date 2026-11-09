from datetime import UTC, datetime, timedelta

from app.models.audit import AuditFilters, AuditLog, AuditResource
from app.services.audit_service import AuditService


class FakeAuditRepo:
    def __init__(self) -> None:
        self.items: list[AuditLog] = []

    async def insert(
        self,
        actor_id: str,
        action: str,
        resource: AuditResource,
        note: str | None,
        ts: datetime,
    ) -> AuditLog:
        log = AuditLog(str(len(self.items)), actor_id, action, resource, ts, note)
        self.items.append(log)
        return log

    async def find(
        self,
        limit: int,
        actor_id: str | None = None,
        resource: AuditResource | None = None,
        before: datetime | None = None,
        filters: AuditFilters | None = None,
    ) -> list[AuditLog]:
        logs = [
            x
            for x in self.items
            if (actor_id is None or x.actor_id == actor_id)
            and (resource is None or x.resource == resource)
            and (before is None or x.ts < before)
        ]
        return sorted(logs, key=lambda x: x.ts, reverse=True)[:limit]


async def test_record_uses_clock_and_lists_newest_first() -> None:
    now = datetime(2026, 10, 1, tzinfo=UTC)
    repo = FakeAuditRepo()
    svc = AuditService(repo, clock=lambda: now)
    first = await svc.record("u1", "script.approve", AuditResource("script", "s1"))
    now += timedelta(minutes=1)
    await svc.record("u2", "pack.publish", AuditResource("pack", "p1"), note="v3")

    assert first.ts == datetime(2026, 10, 1, tzinfo=UTC)
    assert [x.action for x in await svc.find()] == ["pack.publish", "script.approve"]
    assert [x.note for x in await svc.find(actor_id="u2")] == ["v3"]
    assert await svc.find(resource=AuditResource("script", "s1")) == [first]
