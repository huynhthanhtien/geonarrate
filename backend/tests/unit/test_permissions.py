import pytest

from app.core.deps import require_permission
from app.core.exceptions import ForbiddenError
from app.core.permissions import Permission, permissions_for
from app.core.security import Principal


def test_role_permissions() -> None:
    assert permissions_for("admin") == frozenset(Permission)
    assert Permission.ADMIN_MANAGE not in permissions_for("editor")
    assert Permission.PACK_PUBLISH not in permissions_for("editor")
    assert permissions_for("translator") == {
        Permission.ATTRACTION_READ,
        Permission.TRANSLATION_REVIEW,
    }
    assert permissions_for("ghost") == frozenset()


def test_require_permission() -> None:
    check = require_permission(Permission.ADMIN_MANAGE)
    admin = Principal(user_id="1", role="admin")
    assert check(admin) is admin
    with pytest.raises(ForbiddenError):
        check(Principal(user_id="2", role="editor"))
