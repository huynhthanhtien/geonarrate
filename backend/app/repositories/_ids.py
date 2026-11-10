import uuid
from collections.abc import Mapping
from typing import Any


def parse_uuid(value: str) -> uuid.UUID | None:
    """Id lạ (vd. JWT cũ mang ObjectId của Mongo) coi như không tồn tại, không phải lỗi 500."""
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def record(row: Mapping[Any, Any]) -> dict[str, Any]:
    """Chuyển dòng CSDL thành dict, UUID thành chuỗi để dùng thẳng ở tầng trên."""
    return {str(k): (str(v) if isinstance(v, uuid.UUID) else v) for k, v in row.items()}
