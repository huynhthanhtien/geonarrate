"""JWT (HS256) + băm mật khẩu argon2id + băm refresh token (chương 10)."""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError

# HS256: chỉ backend vừa phát vừa kiểm token nên một khoá đối xứng là đủ
JWT_ALGORITHM = "HS256"

_hasher = PasswordHasher()  # mặc định argon2id
# So khớp với hash giả khi email không tồn tại để thời gian phản hồi như nhau
_DUMMY_HASH = _hasher.hash("geonarrate-dummy-password")


@dataclass(frozen=True)
class Principal:
    """Người gọi API, lấy từ access token."""

    user_id: str
    role: str


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """`password_hash=None` (không có user) vẫn tốn thời gian băm như bình thường."""
    try:
        _hasher.verify(password_hash or _DUMMY_HASH, password)
    except (VerificationError, InvalidHashError):
        return False
    return password_hash is not None


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def create_access_token(user_id: str, role: str, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    claims = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(seconds=get_settings().access_token_ttl_s),
    }
    return jwt.encode(claims, get_settings().jwt_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Principal:
    try:
        claims = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp", "type"]},
        )
    except jwt.ExpiredSignatureError as e:
        raise UnauthorizedError("token_expired", "Access token đã hết hạn") from e
    except jwt.InvalidTokenError as e:
        raise UnauthorizedError("invalid_token", "Access token không hợp lệ") from e
    if claims["type"] != "access":
        raise UnauthorizedError("invalid_token", "Không phải access token")
    return Principal(user_id=claims["sub"], role=claims.get("role", ""))


def new_refresh_token() -> str:
    """Chuỗi ngẫu nhiên gửi cho client; DB chỉ lưu hash của nó."""
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    # Token đủ ngẫu nhiên (256 bit) nên SHA-256 là đủ, không cần băm chậm như mật khẩu
    return hashlib.sha256(token.encode()).hexdigest()
