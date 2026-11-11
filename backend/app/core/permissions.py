"""Danh mục quyền và ma trận vai trò tập trung của CMS."""

from enum import StrEnum

from app.models.user import Role


class Permission(StrEnum):
    POI_READ = "poi:read"
    POI_WRITE = "poi:write"
    SCRIPT_WRITE = "script:write"
    SCRIPT_APPROVE = "script:approve"
    TRANSLATION_READ = "translation:read"
    TRANSLATION_WRITE = "translation:write"
    TRANSLATION_APPROVE = "translation:approve"
    GLOSSARY_READ = "glossary:read"
    GLOSSARY_WRITE = "glossary:write"
    AUDIO_READ = "audio:read"
    AUDIO_BUILD = "audio:build"
    TOUR_READ = "tour:read"
    TOUR_WRITE = "tour:write"
    PACK_READ = "pack:read"
    PACK_BUILD = "pack:build"
    PACK_PUBLISH = "pack:publish"
    TICKET_READ = "ticket:read"
    TICKET_MANAGE = "ticket:manage"
    ANALYTICS_READ = "analytics:read"
    USER_MANAGE = "user:manage"
    AUDIT_READ = "audit:read"


ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.ADMIN: frozenset(Permission),
    Role.EDITOR: frozenset(
        {
            Permission.POI_READ,
            Permission.POI_WRITE,
            Permission.SCRIPT_WRITE,
            Permission.TRANSLATION_READ,
            Permission.GLOSSARY_READ,
            Permission.AUDIO_READ,
            Permission.TOUR_READ,
            Permission.TOUR_WRITE,
        }
    ),
    Role.REVIEWER: frozenset(
        {
            Permission.POI_READ,
            Permission.SCRIPT_APPROVE,
            Permission.TRANSLATION_READ,
            Permission.GLOSSARY_READ,
            Permission.AUDIO_READ,
            Permission.TOUR_READ,
            Permission.PACK_READ,
        }
    ),
    Role.TRANSLATOR: frozenset(
        {
            Permission.POI_READ,
            Permission.TRANSLATION_READ,
            Permission.TRANSLATION_WRITE,
            Permission.TRANSLATION_APPROVE,
            Permission.GLOSSARY_READ,
            Permission.GLOSSARY_WRITE,
            Permission.AUDIO_READ,
            Permission.TOUR_READ,
        }
    ),
    Role.OPERATOR: frozenset(
        {
            Permission.POI_READ,
            Permission.TRANSLATION_READ,
            Permission.AUDIO_READ,
            Permission.AUDIO_BUILD,
            Permission.TOUR_READ,
            Permission.PACK_READ,
            Permission.PACK_BUILD,
            Permission.PACK_PUBLISH,
            Permission.TICKET_READ,
            Permission.TICKET_MANAGE,
            Permission.ANALYTICS_READ,
        }
    ),
}


def permissions_for(roles: tuple[str, ...]) -> frozenset[Permission]:
    """Hợp quyền của các vai trò hợp lệ; vai trò lạ không cấp quyền."""
    result: set[Permission] = set()
    for role in roles:
        try:
            result.update(ROLE_PERMISSIONS[Role(role)])
        except ValueError:
            continue
    return frozenset(result)
