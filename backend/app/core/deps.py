from collections.abc import Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.cache import get_redis
from app.core.database import get_db
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.permissions import Permission, permissions_for
from app.core.security import Principal
from app.repositories.access_revocation_repo import RedisAccessRevocationRepository
from app.repositories.audit_repo import MongoAuditLogRepository
from app.repositories.language_repo import MongoLanguageRepository
from app.repositories.token_repo import MongoRefreshTokenRepository
from app.repositories.user_repo import MongoUserRepository
from app.services.audit_service import AuditService
from app.services.auth_service import AuthService
from app.services.language_service import LanguageService

# auto_error=False: thiếu header cũng trả 401 dạng RFC 7807 như các lỗi khác
_bearer = HTTPBearer(auto_error=False)


def get_language_service() -> LanguageService:
    return LanguageService(MongoLanguageRepository(get_db()))


def get_auth_service() -> AuthService:
    db = get_db()
    return AuthService(
        MongoUserRepository(db),
        MongoRefreshTokenRepository(db),
        RedisAccessRevocationRepository(get_redis()),
    )


def get_audit_service() -> AuditService:
    return AuditService(MongoAuditLogRepository(get_db()))


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
