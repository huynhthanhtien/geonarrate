from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class Role(StrEnum):
    """Vai trò lưu dạng chuỗi trong `users.role`; quyền của từng vai trò khai báo trong code."""

    ADMIN = "admin"
    EDITOR = "editor"
    TRANSLATOR = "translator"


@dataclass(frozen=True)
class User:
    """Domain entity — không phụ thuộc Mongo hay HTTP."""

    id: str
    email: str
    password_hash: str
    role: Role
    full_name: str = ""
    is_active: bool = True
    last_login_at: datetime | None = None


@dataclass(frozen=True)
class RefreshToken:
    """Một refresh token đã phát; chỉ giữ hash, các token xoay vòng chung `family_id`."""

    id: str
    user_id: str
    token_hash: str
    family_id: str
    expires_at: datetime
    revoked_at: datetime | None = None
