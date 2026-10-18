from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.v1.schemas.auth import LoginIn, RefreshIn, TokenOut, UserOut
from app.core.deps import get_auth_service, get_current_principal
from app.core.security import Principal
from app.services.auth_service import AuthService, TokenPair

router = APIRouter(prefix="/auth", tags=["identity"])

AuthSvc = Annotated[AuthService, Depends(get_auth_service)]


def _to_out(pair: TokenPair) -> TokenOut:
    u = pair.user
    return TokenOut(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        expires_in=pair.expires_in,
        user=UserOut(id=u.id, email=u.email, full_name=u.full_name, role=u.role.value),
    )


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, svc: AuthSvc) -> TokenOut:
    return _to_out(await svc.login(body.email, body.password))


@router.post("/refresh", response_model=TokenOut)
async def refresh(body: RefreshIn, svc: AuthSvc) -> TokenOut:
    """Xoay vòng: token cũ bị thu hồi; gửi lại token cũ thì cả chuỗi bị thu hồi."""
    return _to_out(await svc.refresh(body.refresh_token))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshIn, svc: AuthSvc) -> None:
    await svc.logout(body.refresh_token)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
    principal: Annotated[Principal, Depends(get_current_principal)], svc: AuthSvc
) -> None:
    """Đăng xuất mọi nơi: thu hồi mọi refresh token của người đang đăng nhập."""
    await svc.logout_all(principal.user_id)
