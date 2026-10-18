from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core import security
from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError


def test_password_hash_is_argon2id_and_verifies() -> None:
    h = security.hash_password("s3cret")
    assert h.startswith("$argon2id$")
    assert security.verify_password(h, "s3cret")
    assert not security.verify_password(h, "wrong")
    assert not security.password_needs_rehash(h)


def test_verify_password_without_user_is_false() -> None:
    assert not security.verify_password(None, "geonarrate-dummy-password")
    assert not security.verify_password("not-a-hash", "x")


def test_access_token_round_trip() -> None:
    token = security.create_access_token("u1", "editor")
    assert security.decode_access_token(token) == security.Principal("u1", "editor")


def test_expired_access_token_rejected() -> None:
    past = datetime.now(UTC) - timedelta(hours=1)
    token = security.create_access_token("u1", "editor", now=past)
    with pytest.raises(UnauthorizedError) as e:
        security.decode_access_token(token)
    assert e.value.code == "token_expired"


@pytest.mark.parametrize(
    "token",
    [
        "garbage",
        # ký bằng khoá khác
        jwt.encode(
            {"sub": "u1", "type": "access", "exp": 9_999_999_999},
            "another-secret-that-is-at-least-32-bytes",
            algorithm="HS256",
        ),
        # thiếu claim `type`
        jwt.encode(
            {"sub": "u1", "exp": 9_999_999_999},
            "another-secret-that-is-at-least-32-bytes",
            algorithm="HS256",
        ),
    ],
)
def test_invalid_access_token_rejected(token: str) -> None:
    with pytest.raises(UnauthorizedError):
        security.decode_access_token(token)


def test_access_token_with_wrong_type_rejected() -> None:
    token = jwt.encode(
        {"sub": "u1", "type": "refresh", "exp": datetime.now(UTC) + timedelta(minutes=5)},
        get_settings().jwt_secret,
        algorithm=security.JWT_ALGORITHM,
    )
    with pytest.raises(UnauthorizedError) as e:
        security.decode_access_token(token)
    assert e.value.code == "invalid_token"


def test_refresh_token_hash_is_stable_and_not_plaintext() -> None:
    t = security.new_refresh_token()
    assert len(t) >= 40
    assert security.hash_refresh_token(t) == security.hash_refresh_token(t)
    assert security.hash_refresh_token(t) != t
