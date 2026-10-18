from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class DomainError(Exception):
    """Lỗi nghiệp vụ — service raise, handler map sang RFC 7807."""

    status = 400

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


class NotFoundError(DomainError):
    status = 404


class UnauthorizedError(DomainError):
    status = 401


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(request: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status,
            media_type="application/problem+json",
            headers={"WWW-Authenticate": "Bearer"} if exc.status == 401 else None,
            content={
                "type": f"urn:geonarrate:{exc.code}",
                "title": exc.code,
                "status": exc.status,
                "detail": exc.detail,
                "trace_id": request.headers.get("x-trace-id"),
            },
        )
