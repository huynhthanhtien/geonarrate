from dataclasses import dataclass


@dataclass(frozen=True)
class Language:
    """Domain entity — không phụ thuộc Mongo hay HTTP."""

    code: str
    bcp47: str
    native_name: str
    is_source: bool = False
    is_active: bool = True
