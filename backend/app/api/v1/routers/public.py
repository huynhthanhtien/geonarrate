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
from app.core.device import issue_device_id, verify_device_id
from app.services.catalog_service import CatalogService

router = APIRouter(prefix="/public", tags=["public"])
Catalog = Annotated[CatalogService, Depends(get_catalog_service)]


@router.post("/devices", response_model=dict[str, str], status_code=201)
async def register_device() -> dict[str, str]:
    return {"device_id": issue_device_id()}


@router.get("/tours", response_model=list[PublicTourOut])
async def tours(svc: Catalog) -> list[dict[str, Any]]:
    return await svc.public_tours()


@router.post("/tickets/activate", response_model=ActivateOut)
async def activate(body: ActivateIn, svc: Catalog) -> dict[str, Any]:
    verify_device_id(body.device_id)
    return await svc.activate_ticket(body.code, body.device_id)


@router.get("/tours/{tour_id}/packs/{lang}", response_model=ManifestOut)
async def manifest(
    tour_id: str,
    lang: str,
    svc: Catalog,
    device_id: Annotated[Device, Query()],
) -> dict[str, Any]:
    verify_device_id(device_id)
    return await svc.public_manifest(tour_id, lang, device_id)


@router.get(
    "/tours/{tour_id}/packs/{lang}/files/{poi_id}",
    response_class=FileResponse,
    responses={200: {"content": {"audio/mpeg": {}}}},
)
async def pack_file(
    tour_id: str,
    lang: str,
    poi_id: str,
    svc: Catalog,
    device_id: Annotated[Device, Query()],
    pack_id: str | None = None,
) -> FileResponse:
    verify_device_id(device_id)
    path = await svc.public_file(tour_id, lang, poi_id, device_id, pack_id)
    return FileResponse(path, media_type="audio/mpeg")


@router.post("/playback-events", response_model=EventsOut)
async def playback_events(body: EventsIn, svc: Catalog) -> EventsOut:
    verify_device_id(body.device_id)
    events = [e.model_dump() for e in body.events]
    return EventsOut(accepted=await svc.record_events(body.device_id, events))
