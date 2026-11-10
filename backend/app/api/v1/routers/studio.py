from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse

from app.api.v1.schemas.studio import (
    AccountCreateIn,
    AccountOut,
    AccountUpdateIn,
    AnalyticsOut,
    AudioRetryIn,
    AudioRow,
    GlossaryIn,
    GlossaryOut,
    NoteIn,
    PackBuildIn,
    PackOut,
    RevokeIn,
    RevokeOut,
    RollbackIn,
    TicketIssueIn,
    TicketIssueOut,
    TicketOut,
    TourCreateIn,
    TourDetailOut,
    TourOut,
    TourUpdateIn,
    TranslationEditIn,
    TranslationJobOut,
    TranslationOut,
)
from app.core.deps import (
    get_catalog_service,
    get_content_service,
    get_pipeline_service,
    require_permission,
)
from app.core.permissions import Permission
from app.core.security import Principal
from app.models.user import Role, User
from app.services.catalog_service import CatalogService
from app.services.content_service import ContentService
from app.services.pipeline_service import PipelineService

router = APIRouter(tags=["studio"])

Content = Annotated[ContentService, Depends(get_content_service)]
Pipeline = Annotated[PipelineService, Depends(get_pipeline_service)]
Catalog = Annotated[CatalogService, Depends(get_catalog_service)]
Translator = Annotated[Principal, Depends(require_permission(Permission.TRANSLATION_REVIEW))]
AudioBuilder = Annotated[Principal, Depends(require_permission(Permission.AUDIO_BUILD))]
Publisher = Annotated[Principal, Depends(require_permission(Permission.PACK_PUBLISH))]
Admin = Annotated[Principal, Depends(require_permission(Permission.ADMIN_MANAGE))]
Analyst = Annotated[Principal, Depends(require_permission(Permission.ANALYTICS_VIEW))]


# --- UC-05
@router.get("/translation-jobs", response_model=list[TranslationJobOut])
async def translation_jobs(svc: Pipeline, _: Translator) -> list[dict[str, Any]]:
    return await svc.translation_progress()


@router.get("/translations", response_model=list[TranslationOut])
async def list_translations(
    svc: Content, _: Translator, lang: str | None = None, status: str | None = None
) -> list[dict[str, Any]]:
    return await svc.list_translations(lang, status)


@router.put("/translations/{translation_id}", response_model=TranslationOut)
async def edit_translation(
    translation_id: str, body: TranslationEditIn, svc: Content, _: Translator
) -> dict[str, Any]:
    return await svc.edit_translation(translation_id, body.text)


@router.post("/translations/{translation_id}/approve", response_model=TranslationOut)
async def approve_translation(
    translation_id: str, svc: Content, user: Translator
) -> dict[str, Any]:
    return await svc.approve_translation(translation_id, user.user_id)


@router.post("/translations/{translation_id}/reject", response_model=TranslationOut)
async def reject_translation(
    translation_id: str, body: NoteIn, svc: Content, user: Translator
) -> dict[str, Any]:
    return await svc.reject_translation(translation_id, body.review_note, user.user_id)


# --- UC-06
@router.get("/glossaries", response_model=list[GlossaryOut])
async def list_glossary(
    svc: Content, _: Translator, lang: str | None = None
) -> list[dict[str, Any]]:
    return await svc.list_glossary(lang)


@router.post("/glossaries", response_model=GlossaryOut, status_code=status.HTTP_201_CREATED)
async def add_term(body: GlossaryIn, svc: Content, user: Translator) -> dict[str, Any]:
    return await svc.add_term(
        body.term,
        body.target_lang,
        body.translation,
        body.is_required,
        body.poi_id,
        user.user_id,
    )


@router.delete("/glossaries/{glossary_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_term(glossary_id: str, svc: Content, _: Translator) -> None:
    await svc.delete_term(glossary_id)


# --- UC-07
@router.get("/audio/status", response_model=list[AudioRow])
async def audio_status(svc: Pipeline, _: AudioBuilder) -> list[dict[str, Any]]:
    return await svc.audio_status()


@router.get(
    "/audio/{poi_id}/{lang}/preview",
    response_class=FileResponse,
    responses={200: {"content": {"audio/mpeg": {}}}},
)
async def preview_audio(
    poi_id: str, lang: str, svc: Pipeline, _: AudioBuilder
) -> FileResponse:
    path = await svc.audio_preview_path(poi_id, lang)
    return FileResponse(path, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@router.post("/audio/retry", status_code=status.HTTP_204_NO_CONTENT)
async def retry_audio(body: AudioRetryIn, svc: Pipeline, user: AudioBuilder) -> None:
    await svc.retry_audio(body.poi_id, body.lang, user.user_id)


# --- UC-08
@router.get("/tours", response_model=list[TourOut])
async def list_tours(svc: Catalog, _: Admin) -> list[dict[str, Any]]:
    return await svc.list_tours()


@router.post("/tours", response_model=TourDetailOut, status_code=status.HTTP_201_CREATED)
async def create_tour(body: TourCreateIn, svc: Catalog, user: Admin) -> dict[str, Any]:
    return await svc.create_tour(body.model_dump(), user.user_id)


@router.get("/tours/{tour_id}", response_model=TourDetailOut)
async def get_tour(tour_id: str, svc: Catalog, _: Admin) -> dict[str, Any]:
    return await svc.get_tour(tour_id)


@router.patch("/tours/{tour_id}", response_model=TourDetailOut)
async def update_tour(
    tour_id: str, body: TourUpdateIn, svc: Catalog, user: Admin
) -> dict[str, Any]:
    fields = body.model_dump(exclude_none=True)
    return await svc.update_tour(tour_id, fields, user.user_id)


# --- UC-09, UC-10
@router.get("/packs", response_model=list[PackOut])
async def list_packs(
    svc: Pipeline, _: Publisher, tour_id: str | None = None, lang: str | None = None
) -> list[dict[str, Any]]:
    return await svc.list_packs(tour_id, lang)


@router.post("/packs/build", response_model=PackOut, status_code=status.HTTP_201_CREATED)
async def build_pack(body: PackBuildIn, svc: Pipeline, user: AudioBuilder) -> dict[str, Any]:
    return await svc.build_pack(body.tour_id, body.lang, user.user_id)


@router.post("/packs/{pack_id}/publish", response_model=PackOut)
async def publish_pack(pack_id: str, svc: Pipeline, user: Publisher) -> dict[str, Any]:
    return await svc.publish_pack(pack_id, user.user_id)


@router.post("/packs/{pack_id}/rollback", response_model=PackOut)
async def rollback_pack(
    pack_id: str, body: RollbackIn, svc: Pipeline, user: Publisher
) -> dict[str, Any]:
    return await svc.rollback_pack(pack_id, body.reason, user.user_id)


# --- UC-11
def _account(u: User) -> AccountOut:
    return AccountOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=u.role.value,
        is_active=u.is_active,
        last_login_at=u.last_login_at,
    )


@router.get("/admin/users", response_model=list[AccountOut])
async def list_users(svc: Catalog, _: Admin) -> list[AccountOut]:
    return [_account(u) for u in await svc.list_users()]


@router.post("/admin/users", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(body: AccountCreateIn, svc: Catalog, user: Admin) -> AccountOut:
    created = await svc.create_account(
        body.email, body.password, Role(body.role), body.full_name, user.user_id
    )
    return _account(created)


@router.patch("/admin/users/{user_id}", response_model=AccountOut)
async def update_account(
    user_id: str, body: AccountUpdateIn, svc: Catalog, user: Admin
) -> AccountOut:
    fields = body.model_dump(exclude_none=True)
    return _account(await svc.update_account(user_id, fields, user.user_id))


# --- UC-13
@router.post("/tickets", response_model=TicketIssueOut, status_code=status.HTTP_201_CREATED)
async def issue_tickets(body: TicketIssueIn, svc: Catalog, user: Admin) -> TicketIssueOut:
    """Mã gốc chỉ trả về một lần này để in; CSDL chỉ lưu hash."""
    codes = await svc.issue_tickets(
        body.batch, body.tour_ids, body.valid_until, body.transfers_left, body.count, user.user_id
    )
    return TicketIssueOut(batch=body.batch, codes=codes)


@router.get("/tickets", response_model=list[TicketOut])
async def search_tickets(svc: Catalog, _: Admin, q: str | None = None) -> list[dict[str, Any]]:
    return await svc.search_tickets(q)


@router.post("/tickets/revoke", response_model=RevokeOut)
async def revoke_tickets(body: RevokeIn, svc: Catalog, user: Admin) -> RevokeOut:
    return RevokeOut(revoked=await svc.revoke_tickets(body.ticket_id, body.batch, user.user_id))


# --- UC-14
@router.get("/analytics/summary", response_model=AnalyticsOut)
async def analytics_summary(
    svc: Catalog,
    _: Analyst,
    start: datetime | None = None,
    end: datetime | None = None,
    tour_id: str | None = None,
    lang: str | None = None,
) -> dict[str, Any]:
    return await svc.analytics(start, end, tour_id, lang)
