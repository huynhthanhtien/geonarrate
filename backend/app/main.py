from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routers import languages
from app.core import cache, database
from app.core.deps import get_language_service
from app.core.exceptions import install_handlers


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await database.connect()
    await database.ensure_indexes()
    await get_language_service().seed_defaults()
    yield
    await cache.close_redis()
    await database.disconnect()


app = FastAPI(title="GeoNarrate API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
install_handlers(app)
app.include_router(languages.router, prefix="/api/v1")


@app.get("/healthz", tags=["ops"])
async def healthz() -> dict[str, str]:
    await database.get_db().command("ping")
    await cache.get_redis().ping()
    return {"status": "ok"}
