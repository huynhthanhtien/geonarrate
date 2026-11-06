"""API cho app di động: du khách không có tài khoản, nhận diện bằng device_id (UC-15 đến 18)."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse

from app.api.v1.schemas.studio import (
    ActivateIn,
    ActivateOut,
    Device,
    EventsIn,
    EventsOut,
    ManifestOut,
    PublicTourOut,
)
from app.core.deps import get_catalog_service
from app.services.catalog_service import CatalogService

router = APIRouter(prefix="/public", tags=["public"])
Catalog = Annotated[CatalogService, Depends(get_catalog_service)]


@router.get("/tours", response_model=list[PublicTourOut])
async def tours(svc: Catalog) -> list[dict[str, Any]]:
    return await svc.public_tours()


@router.post("/tickets/activate", response_model=ActivateOut)
async def activate(body: ActivateIn, svc: Catalog) -> dict[str, Any]:
    return await svc.activate_ticket(body.code, body.device_id)


@router.get("/tours/{tour_id}/packs/{lang}", response_model=ManifestOut)
async def manifest(
    tour_id: str,
    lang: str,
    svc: Catalog,
    device_id: Annotated[Device, Query()],
    preview: bool = False,
) -> dict[str, Any]:
    return await svc.public_manifest(tour_id, lang, device_id, preview)


@router.get(
    "/tours/{tour_id}/packs/{lang}/files/{attraction_id}",
    response_class=FileResponse,
    responses={200: {"content": {"audio/mpeg": {}}}},
)
async def pack_file(
    tour_id: str,
    lang: str,
    attraction_id: str,
    svc: Catalog,
    device_id: Annotated[Device, Query()],
) -> FileResponse:
    path = await svc.public_file(tour_id, lang, attraction_id, device_id)
    return FileResponse(path, media_type="audio/mpeg")


@router.post("/playback-events", response_model=EventsOut)
async def playback_events(body: EventsIn, svc: Catalog) -> EventsOut:
    events = [e.model_dump() for e in body.events]
    return EventsOut(accepted=await svc.record_events(body.device_id, events))
