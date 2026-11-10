from typing import Literal

from pydantic import BaseModel, Field


class PasswordChangeIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=512)


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: Literal["admin", "editor", "translator"]
    permissions: list[str] = Field(description="Quyền suy ra từ vai trò, web dùng để ẩn/hiện menu")


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Số giây access token còn hiệu lực")
    user: UserOut
