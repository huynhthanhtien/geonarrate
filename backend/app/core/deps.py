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
from app.integrations.storage.local import LocalStorage
from app.integrations.translate.base import TranslateProvider
from app.integrations.translate.groq import GroqTranslate
from app.integrations.translate.libretranslate import LibreTranslate
from app.integrations.translate.mock import MockTranslate
from app.integrations.tts.base import TTSProvider
from app.integrations.tts.edge import EdgeTTS
from app.integrations.tts.magpie import MagpieTTS
from app.repositories.access_revocation_repo import RedisAccessRevocationRepository
from app.repositories.analytics_repo import SqlAnalyticsRepository
from app.repositories.audio_repo import SqlAudioRepository
from app.repositories.audit_repo import SqlAuditLogRepository
from app.repositories.glossary_repo import SqlGlossaryRepository
from app.repositories.job_repo import SqlJobRepository
from app.repositories.language_repo import SqlLanguageRepository
from app.repositories.maintenance_repo import SqlMaintenanceRepository
from app.repositories.poi_repo import SqlPoiRepository
from app.repositories.ticket_repo import SqlTicketRepository
from app.repositories.token_repo import SqlRefreshTokenRepository
from app.repositories.tour_repo import SqlTourRepository
from app.repositories.translation_repo import SqlTranslationRepository
from app.repositories.user_repo import SqlUserRepository
from app.services.audit_service import AuditService
from app.services.auth_service import AuthService
from app.services.catalog_service import CatalogService
from app.services.content_service import ContentService
from app.services.language_service import LanguageService
from app.services.maintenance_service import MaintenanceService
from app.services.pipeline_service import PipelineService
from app.services.poi_service import PoiService

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


def get_poi_service() -> PoiService:
    engine = get_engine()
    return PoiService(SqlPoiRepository(engine), get_audit_service(), SqlLanguageRepository(engine))


def get_content_service() -> ContentService:
    engine = get_engine()
    return ContentService(
        SqlTranslationRepository(engine), SqlGlossaryRepository(engine), get_audit_service()
    )


def _translator() -> TranslateProvider:
    settings = get_settings()
    if settings.translate_provider == "groq":
        return GroqTranslate(settings.groq_api_key, settings.groq_model)
    if settings.translate_provider == "libretranslate":
        return LibreTranslate(settings.libretranslate_url, settings.libretranslate_api_key)
    return MockTranslate()


def _tts() -> TTSProvider:
    settings = get_settings()
    if settings.tts_provider == "magpie":
        return MagpieTTS(settings.magpie_tts_url)
    return EdgeTTS()


def get_pipeline_service() -> PipelineService:
    settings = get_settings()
    engine = get_engine()
    return PipelineService(
        SqlJobRepository(engine),
        SqlPoiRepository(engine),
        SqlTranslationRepository(engine),
        SqlGlossaryRepository(engine),
        SqlAudioRepository(engine),
        SqlTourRepository(engine),
        SqlLanguageRepository(engine),
        get_audit_service(),
        LocalStorage(settings.storage_dir),
        _translator(),
        _tts(),
        tts_voice=settings.magpie_tts_voice if settings.tts_provider == "magpie" else None,
    )


def get_catalog_service() -> CatalogService:
    engine = get_engine()
    return CatalogService(
        SqlTourRepository(engine),
        SqlTicketRepository(engine),
        SqlAnalyticsRepository(engine),
        SqlUserRepository(engine),
        get_auth_service(),
        get_pipeline_service(),
        get_audit_service(),
    )


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
        if permission not in permissions_for(principal.roles):
            raise ForbiddenError("forbidden", f"Cần quyền {permission}")
        return principal

    return _check


def require_any_permission(*permissions: Permission) -> Callable[[Principal], Principal]:
    """Cho qua nếu có ít nhất một quyền (vd. danh sách tour mà nhiều trang cần)."""

    def _check(principal: Annotated[Principal, Depends(get_current_principal)]) -> Principal:
        if not set(permissions) & permissions_for(principal.roles):
            raise ForbiddenError("forbidden", f"Cần một trong các quyền {', '.join(permissions)}")
        return principal

    return _check
