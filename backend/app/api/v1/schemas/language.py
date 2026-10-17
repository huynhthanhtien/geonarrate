from pydantic import BaseModel


class LanguageOut(BaseModel):
    code: str
    bcp47: str
    native_name: str
    is_source: bool
