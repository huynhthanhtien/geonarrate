from datetime import datetime

from pydantic import BaseModel


class AuditResourceOut(BaseModel):
    type: str
    id: str


class AuditLogOut(BaseModel):
    id: str
    actor_id: str
    action: str
    resource: AuditResourceOut
    note: str | None
    ts: datetime
