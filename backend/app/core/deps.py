from collections.abc import Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.cache import get_redis
from app.core.config import get_settings
from app.core.database import get_engine
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.permissions import Permission, permissions_for
from app.core.security import Principal
from app.repositories.access_revocation_repo import RedisAccessRevocationRepository
from app.repositories.audit_repo import SqlAuditLogRepository
from app.repositories.language_repo import SqlLanguageRepository
from app.repositories.maintenance_repo import SqlMaintenanceRepository
from app.repositories.token_repo import SqlRefreshTokenRepository
from app.repositories.user_repo import SqlUserRepository
from app.services.audit_service import AuditService
from app.services.auth_service import AuthService
from app.services.language_service import LanguageService
from app.services.maintenance_service import MaintenanceService

# auto_error=False: thiếu header cũng trả 401 dạng RFC 7807 như các lỗi khác
_bearer = HTTPBearer(auto_error=False)


def get_language_service() -> LanguageService:
    return LanguageService(SqlLanguageRepository(get_engine()))


def get_auth_service() -> AuthService:
    engine = get_engine()
    return AuthService(
        SqlUserRepository(engine),
        SqlRefreshTokenRepository(engine),
        RedisAccessRevocationRepository(get_redis()),
    )


def get_audit_service() -> AuditService:
    return AuditService(SqlAuditLogRepository(get_engine()))


def get_maintenance_service() -> MaintenanceService:
    settings = get_settings()
    return MaintenanceService(
        SqlMaintenanceRepository(get_engine()), settings.playback_retention_days
    )


async def get_current_principal(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    svc: Annotated[AuthService, Depends(get_auth_service)],
) -> Principal:
    if creds is None:
        raise UnauthorizedError("not_authenticated", "Thiếu access token")
    return await svc.authenticate(creds.credentials)


def require_permission(permission: Permission) -> Callable[[Principal], Principal]:
    """Dependency guard: `Depends(require_permission(Permission.PACK_PUBLISH))` ở router."""

    def _check(principal: Annotated[Principal, Depends(get_current_principal)]) -> Principal:
        if permission not in permissions_for(principal.role):
            raise ForbiddenError("forbidden", f"Cần quyền {permission}")
        return principal

    return _check
