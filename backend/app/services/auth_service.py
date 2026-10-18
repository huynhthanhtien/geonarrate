import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core import security
from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError
from app.models.user import Role, User
from app.repositories.token_repo import RefreshTokenRepository
from app.repositories.user_repo import UserRepository


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int
    user: User


def _utcnow() -> datetime:
    return datetime.now(UTC)


def normalize_email(email: str) -> str:
    return email.strip().lower()


class AuthService:
    def __init__(
        self,
        users: UserRepository,
        tokens: RefreshTokenRepository,
        clock: Callable[[], datetime] = _utcnow,
    ) -> None:
        self._users = users
        self._tokens = tokens
        self._clock = clock

    async def login(self, email: str, password: str) -> TokenPair:
        user = await self._users.get_by_email(normalize_email(email))
        if not security.verify_password(user.password_hash if user else None, password):
            raise UnauthorizedError("invalid_credentials", "Email hoặc mật khẩu không đúng")
        assert user is not None
        if not user.is_active:
            raise UnauthorizedError("user_inactive", "Tài khoản đã bị khoá")
        now = self._clock()
        rehash = (
            security.hash_password(password)
            if security.password_needs_rehash(user.password_hash)
            else None
        )
        await self._users.mark_login(user.id, now, rehash)
        # Mỗi lần đăng nhập mở một chuỗi (family) token mới
        return await self._issue(user, family_id=uuid.uuid4().hex, now=now)

    async def refresh(self, refresh_token: str) -> TokenPair:
        token_hash = security.hash_refresh_token(refresh_token)
        now = self._clock()
        current = await self._tokens.revoke_if_active(token_hash, now)
        if current is None:
            known = await self._tokens.get_by_hash(token_hash)
            if known is not None:
                # Token đã bị thay mà vẫn được gửi lại → coi như bị lộ, thu hồi cả chuỗi
                await self._tokens.revoke_family(known.family_id, now)
                raise UnauthorizedError("refresh_token_reused", "Refresh token đã được dùng")
            raise UnauthorizedError("invalid_refresh_token", "Refresh token không hợp lệ")
        if current.expires_at <= now:
            raise UnauthorizedError("invalid_refresh_token", "Refresh token đã hết hạn")
        user = await self._users.get_by_id(current.user_id)
        if user is None or not user.is_active:
            await self._tokens.revoke_family(current.family_id, now)
            raise UnauthorizedError("user_inactive", "Tài khoản đã bị khoá")
        return await self._issue(user, family_id=current.family_id, now=now)

    async def logout(self, refresh_token: str) -> None:
        """Đăng xuất thiết bị hiện tại; token không hợp lệ thì bỏ qua (idempotent)."""
        token_hash = security.hash_refresh_token(refresh_token)
        token = await self._tokens.get_by_hash(token_hash)
        if token is not None:
            await self._tokens.revoke_family(token.family_id, self._clock())

    async def logout_all(self, user_id: str) -> None:
        await self._tokens.revoke_all_for_user(user_id, self._clock())

    async def seed_dev_admin(self) -> None:
        """Chỉ môi trường dev: tạo admin từ DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD nếu chưa có."""
        s = get_settings()
        if s.app_env != "dev" or not s.dev_admin_email or not s.dev_admin_password:
            return
        email = normalize_email(s.dev_admin_email)
        if await self._users.get_by_email(email) is None:
            await self._users.insert(
                email,
                security.hash_password(s.dev_admin_password),
                Role.ADMIN,
                "Dev Admin",
                self._clock(),
            )

    async def _issue(self, user: User, family_id: str, now: datetime) -> TokenPair:
        settings = get_settings()
        refresh_token = security.new_refresh_token()
        await self._tokens.insert(
            user.id,
            security.hash_refresh_token(refresh_token),
            family_id,
            now + timedelta(seconds=settings.refresh_token_ttl_s),
            now,
        )
        return TokenPair(
            access_token=security.create_access_token(user.id, user.role.value, now),
            refresh_token=refresh_token,
            expires_in=settings.access_token_ttl_s,
            user=user,
        )
