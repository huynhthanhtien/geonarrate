from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from app.core import security
from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError
from app.models.user import RefreshToken, Role, User
from app.services.auth_service import AuthService


class FakeUserRepo:
    def __init__(self) -> None:
        self.items: dict[str, User] = {}

    async def get_by_email(self, email: str) -> User | None:
        return next((u for u in self.items.values() if u.email == email), None)

    async def get_by_id(self, user_id: str) -> User | None:
        return self.items.get(user_id)

    async def insert(
        self, email: str, password_hash: str, role: Role, full_name: str, now: datetime
    ) -> User:
        user = User(str(len(self.items) + 1), email, password_hash, role, full_name)
        self.items[user.id] = user
        return user

    async def mark_login(self, user_id: str, now: datetime, password_hash: str | None) -> None:
        self.items[user_id] = replace(self.items[user_id], last_login_at=now)


class FakeTokenRepo:
    def __init__(self) -> None:
        self.items: dict[str, RefreshToken] = {}

    async def insert(
        self, user_id: str, token_hash: str, family_id: str, expires_at: datetime, now: datetime
    ) -> RefreshToken:
        token = RefreshToken(str(len(self.items)), user_id, token_hash, family_id, expires_at)
        self.items[token_hash] = token
        return token

    async def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        return self.items.get(token_hash)

    async def revoke_if_active(self, token_hash: str, now: datetime) -> RefreshToken | None:
        token = self.items.get(token_hash)
        if token is None or token.revoked_at is not None:
            return None
        self.items[token_hash] = replace(token, revoked_at=now)
        return self.items[token_hash]

    async def revoke_family(self, family_id: str, now: datetime) -> None:
        for k, t in self.items.items():
            if t.family_id == family_id and t.revoked_at is None:
                self.items[k] = replace(t, revoked_at=now)

    async def revoke_all_for_user(self, user_id: str, now: datetime) -> None:
        for k, t in self.items.items():
            if t.user_id == user_id and t.revoked_at is None:
                self.items[k] = replace(t, revoked_at=now)

    def active(self) -> list[RefreshToken]:
        return [t for t in self.items.values() if t.revoked_at is None]


class Clock:
    def __init__(self) -> None:
        # Đóng băng ở giờ thật: decode_access_token kiểm exp theo đồng hồ hệ thống
        self.now = datetime.now(UTC).replace(microsecond=0)

    def __call__(self) -> datetime:
        return self.now


PASSWORD = "correct horse"


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def tokens() -> FakeTokenRepo:
    return FakeTokenRepo()


@pytest.fixture
async def users() -> FakeUserRepo:
    repo = FakeUserRepo()
    now = datetime.now(UTC)
    await repo.insert("editor@x.test", security.hash_password(PASSWORD), Role.EDITOR, "Ed", now)
    return repo


@pytest.fixture
def svc(users: FakeUserRepo, tokens: FakeTokenRepo, clock: Clock) -> AuthService:
    return AuthService(users, tokens, clock)


async def test_login_issues_tokens_and_records_login(
    svc: AuthService, users: FakeUserRepo, tokens: FakeTokenRepo, clock: Clock
) -> None:
    pair = await svc.login("  Editor@X.test ", PASSWORD)
    assert security.decode_access_token(pair.access_token) == security.Principal("1", "editor")
    assert pair.expires_in == get_settings().access_token_ttl_s
    assert users.items["1"].last_login_at == clock.now
    [stored] = tokens.active()
    assert stored.token_hash == security.hash_refresh_token(pair.refresh_token)
    assert stored.expires_at == clock.now + timedelta(seconds=get_settings().refresh_token_ttl_s)


@pytest.mark.parametrize(
    ("email", "password"), [("editor@x.test", "wrong"), ("no@x.test", PASSWORD)]
)
async def test_login_rejects_bad_credentials(svc: AuthService, email: str, password: str) -> None:
    with pytest.raises(UnauthorizedError) as e:
        await svc.login(email, password)
    assert e.value.code == "invalid_credentials"


async def test_login_rejects_inactive_user(svc: AuthService, users: FakeUserRepo) -> None:
    users.items["1"] = replace(users.items["1"], is_active=False)
    with pytest.raises(UnauthorizedError) as e:
        await svc.login("editor@x.test", PASSWORD)
    assert e.value.code == "user_inactive"


async def test_refresh_rotates_token_in_same_family(
    svc: AuthService, tokens: FakeTokenRepo
) -> None:
    first = await svc.login("editor@x.test", PASSWORD)
    second = await svc.refresh(first.refresh_token)
    assert second.refresh_token != first.refresh_token
    [active] = tokens.active()
    assert active.token_hash == security.hash_refresh_token(second.refresh_token)
    assert len({t.family_id for t in tokens.items.values()}) == 1


async def test_reusing_rotated_token_revokes_whole_family(
    svc: AuthService, tokens: FakeTokenRepo
) -> None:
    first = await svc.login("editor@x.test", PASSWORD)
    second = await svc.refresh(first.refresh_token)
    with pytest.raises(UnauthorizedError) as e:
        await svc.refresh(first.refresh_token)
    assert e.value.code == "refresh_token_reused"
    assert tokens.active() == []
    with pytest.raises(UnauthorizedError):
        await svc.refresh(second.refresh_token)


async def test_refresh_rejects_unknown_and_expired(svc: AuthService, clock: Clock) -> None:
    with pytest.raises(UnauthorizedError) as e:
        await svc.refresh("never-issued")
    assert e.value.code == "invalid_refresh_token"

    pair = await svc.login("editor@x.test", PASSWORD)
    clock.now += timedelta(seconds=get_settings().refresh_token_ttl_s + 1)
    with pytest.raises(UnauthorizedError) as e:
        await svc.refresh(pair.refresh_token)
    assert e.value.code == "invalid_refresh_token"


async def test_refresh_rejects_user_locked_after_login(
    svc: AuthService, users: FakeUserRepo, tokens: FakeTokenRepo
) -> None:
    pair = await svc.login("editor@x.test", PASSWORD)
    users.items["1"] = replace(users.items["1"], is_active=False)
    with pytest.raises(UnauthorizedError) as e:
        await svc.refresh(pair.refresh_token)
    assert e.value.code == "user_inactive"
    assert tokens.active() == []


async def test_logout_revokes_only_that_session(svc: AuthService, tokens: FakeTokenRepo) -> None:
    a = await svc.login("editor@x.test", PASSWORD)
    b = await svc.login("editor@x.test", PASSWORD)
    await svc.logout(a.refresh_token)
    await svc.logout("never-issued")  # idempotent, không lỗi
    [active] = tokens.active()
    assert active.token_hash == security.hash_refresh_token(b.refresh_token)


async def test_logout_all_revokes_every_session(svc: AuthService, tokens: FakeTokenRepo) -> None:
    await svc.login("editor@x.test", PASSWORD)
    await svc.login("editor@x.test", PASSWORD)
    await svc.logout_all("1")
    assert tokens.active() == []


async def test_seed_dev_admin_is_idempotent(svc: AuthService, users: FakeUserRepo) -> None:
    await svc.seed_dev_admin()
    await svc.seed_dev_admin()
    admins = [u for u in users.items.values() if u.role is Role.ADMIN]
    assert [u.email for u in admins] == [get_settings().dev_admin_email]
