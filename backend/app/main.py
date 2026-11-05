import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routers import audit, auth, languages
from app.core import cache, database
from app.core.config import get_settings
from app.core.deps import get_auth_service, get_language_service, get_maintenance_service
from app.core.exceptions import install_handlers
from app.core.rate_limit import LoginRateLimitMiddleware


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await database.connect()
    await get_language_service().seed_defaults()
    await get_auth_service().seed_dev_admin()
    purge = asyncio.create_task(
        get_maintenance_service().run_forever(get_settings().purge_interval_s)
    )
    yield
    purge.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await purge
    await cache.close_redis()
    await database.disconnect()


app = FastAPI(title="GeoNarrate API", version="0.1.0", lifespan=lifespan)
# Middleware thêm sau nằm ngoài: CORS phải ở ngoài cùng để cả response 429 cũng có header CORS
app.add_middleware(LoginRateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
install_handlers(app)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(languages.router, prefix="/api/v1")


@app.get("/healthz", tags=["ops"])
async def healthz() -> dict[str, str]:
    await database.ping()
    await cache.get_redis().ping()
    return {"status": "ok"}
