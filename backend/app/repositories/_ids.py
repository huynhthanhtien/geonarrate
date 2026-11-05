import uuid


def parse_uuid(value: str) -> uuid.UUID | None:
    """Id lạ (vd. JWT cũ mang ObjectId của Mongo) coi như không tồn tại, không phải lỗi 500."""
    try:
        return uuid.UUID(value)
    except ValueError:
        return None
