import pytest

from app.core.device import issue_device_id, verify_device_id
from app.core.exceptions import UnauthorizedError


def test_device_id_is_random_and_signed() -> None:
    first, second = issue_device_id(), issue_device_id()
    assert first != second
    verify_device_id(first)
    verify_device_id(second)
    assert len(first) <= 128


@pytest.mark.parametrize(
    "value", ["hardware-id", "x.y", ".", "a" * 32 + "." + "b" * 64, "a" * 32 + "." + "é" * 64]
)
def test_rejects_forged_device(value: str) -> None:
    with pytest.raises(UnauthorizedError):
        verify_device_id(value)


def test_device_cannot_change_identifier() -> None:
    signed = issue_device_id()
    replacement = "0" if signed[0] != "0" else "1"
    with pytest.raises(UnauthorizedError):
        verify_device_id(replacement + signed[1:])
