from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.v1.schemas.language import LanguageOut
from app.core.deps import get_language_service
from app.services.language_service import LanguageService

router = APIRouter(prefix="/languages", tags=["catalog"])


@router.get("", response_model=list[LanguageOut])
async def list_languages(
    svc: Annotated[LanguageService, Depends(get_language_service)],
) -> list[LanguageOut]:
    return [LanguageOut(**lang.__dict__) for lang in await svc.list_active()]
