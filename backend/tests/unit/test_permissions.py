import pytest

from app.core.deps import require_permission
from app.core.exceptions import ForbiddenError
from app.core.permissions import Permission, permissions_for
from app.core.security import Principal


def test_role_permissions() -> None:
    assert permissions_for(("admin",)) == frozenset(Permission)
    assert Permission.USER_MANAGE not in permissions_for(("editor",))
    assert Permission.PACK_PUBLISH not in permissions_for(("editor",))
    assert Permission.TRANSLATION_WRITE in permissions_for(("translator",))
    assert Permission.TRANSLATION_APPROVE in permissions_for(("translator",))
    assert Permission.TRANSLATION_APPROVE not in permissions_for(("editor",))
    assert Permission.SCRIPT_APPROVE in permissions_for(("reviewer",))
    assert Permission.PACK_BUILD in permissions_for(("operator",))
    assert permissions_for(("ghost",)) == frozenset()


def test_require_permission() -> None:
    check = require_permission(Permission.USER_MANAGE)
    admin = Principal(user_id="1", roles=("admin",))
    assert check(admin) is admin
    with pytest.raises(ForbiddenError):
        check(Principal(user_id="2", roles=("editor",)))


def test_permissions_are_combined() -> None:
    assert permissions_for(("editor", "translator")) == permissions_for(
        ("editor",)
    ) | permissions_for(("translator",))
