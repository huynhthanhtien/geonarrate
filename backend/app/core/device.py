"""Mã cài đặt ngẫu nhiên có chữ ký; không dùng mã phần cứng có thể đoán được."""

import hashlib
import hmac
import re
import secrets

from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError


def _signature(identifier: str) -> str:
    return hmac.new(
        get_settings().jwt_secret.encode(), f"device:{identifier}".encode(), hashlib.sha256
    ).hexdigest()


def issue_device_id() -> str:
    identifier = secrets.token_hex(16)
    return f"{identifier}.{_signature(identifier)}"


def verify_device_id(value: str) -> None:
    if not re.fullmatch(r"[0-9a-f]{32}\.[0-9a-f]{64}", value):
        raise UnauthorizedError("invalid_device", "Mã thiết bị không hợp lệ, cần đăng ký lại")
    identifier, signature = value.split(".", 1)
    if not hmac.compare_digest(signature, _signature(identifier)):
        raise UnauthorizedError("invalid_device", "Mã thiết bị không hợp lệ, cần đăng ký lại")
