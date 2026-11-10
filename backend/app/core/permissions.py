"""Bảng vai trò → quyền (chương 06 "Route & phân quyền web"). CSDL v1 không có bảng `roles`."""

from enum import StrEnum

from app.models.user import Role


class Permission(StrEnum):
    POI_READ = "poi:read"
    SCRIPT_WRITE = "script:write"
    TRANSLATION_REVIEW = "translation:review"
    AUDIO_BUILD = "audio:build"
    PACK_PUBLISH = "pack:publish"
    ANALYTICS_VIEW = "analytics:view"
    ADMIN_MANAGE = "admin:manage"


# Theo sơ đồ use case: editor soạn/gửi duyệt script, translator dịch & duyệt bản dịch,
# admin gộp cả quản trị nội dung (build, publish, rollback) lẫn quản trị hệ thống
ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.ADMIN: frozenset(Permission),
    Role.EDITOR: frozenset({Permission.POI_READ, Permission.SCRIPT_WRITE}),
    Role.TRANSLATOR: frozenset({Permission.POI_READ, Permission.TRANSLATION_REVIEW}),
}


def permissions_for(role: str) -> frozenset[Permission]:
    """Vai trò lạ (vd. token cũ sau khi đổi tên vai trò) thì không có quyền nào."""
    try:
        return ROLE_PERMISSIONS[Role(role)]
    except ValueError:
        return frozenset()
