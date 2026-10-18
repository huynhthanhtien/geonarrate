from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.database import get_db
from app.core.exceptions import UnauthorizedError
from app.core.security import Principal, decode_access_token
from app.repositories.language_repo import MongoLanguageRepository
from app.repositories.token_repo import MongoRefreshTokenRepository
from app.repositories.user_repo import MongoUserRepository
from app.services.auth_service import AuthService
from app.services.language_service import LanguageService

# auto_error=False: thiếu header cũng trả 401 dạng RFC 7807 như các lỗi khác
_bearer = HTTPBearer(auto_error=False)


def get_language_service() -> LanguageService:
    return LanguageService(MongoLanguageRepository(get_db()))


def get_auth_service() -> AuthService:
    db = get_db()
    return AuthService(MongoUserRepository(db), MongoRefreshTokenRepository(db))


def get_current_principal(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Principal:
    if creds is None:
        raise UnauthorizedError("not_authenticated", "Thiếu access token")
    return decode_access_token(creds.credentials)
