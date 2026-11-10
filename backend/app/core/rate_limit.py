"""Rate limit đăng nhập theo IP trên Redis (cửa sổ cố định)."""

from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.cache import get_redis
from app.core.config import get_settings
from app.core.exceptions import RateLimitedError, problem_response

LOGIN_PATH = "/api/v1/auth/login"


class PublicRateLimitMiddleware(BaseHTTPMiddleware):
    """Giới hạn theo IP, với cửa sổ riêng cho thao tác kích hoạt vé."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not request.url.path.startswith("/api/v1/public/") or request.method == "OPTIONS":
            return await call_next(request)
        settings = get_settings()
        activation = request.url.path.rstrip("/") == "/api/v1/public/tickets/activate"
        bucket = "activate" if activation else "all"
        limit = settings.public_activate_rate_limit if activation else settings.public_rate_limit
        key = f"rl:public:{bucket}:{request.client.host if request.client else 'unknown'}"
        redis = get_redis()
        async with redis.pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, settings.public_rate_window_s, nx=True)
            count, _ = await pipe.execute()
        if count > limit:
            retry_after = max(await redis.ttl(key), 1)
            return problem_response(
                request,
                RateLimitedError("rate_limited", "Quá nhiều yêu cầu, vui lòng thử lại sau"),
                {"Retry-After": str(retry_after)},
            )
        return await call_next(request)


# Không DECR khi key đã hết hạn — nếu không sẽ tạo key -1 không có TTL
_DECR_IF_EXISTS = """
if redis.call('EXISTS', KEYS[1]) == 1 then
  return redis.call('DECR', KEYS[1])
end
return 0
"""


class LoginRateLimitMiddleware(BaseHTTPMiddleware):
    """Quá `login_rate_limit` lần sai trong `login_rate_window_s` giây thì trả 429.

    Mỗi request được đếm trước khi xử lý (chặn được cả loạt request song song), đăng nhập
    thành công thì trả lại lượt — nên thực chất chỉ đếm số lần sai.

    Đếm theo `request.client.host`: chạy sau reverse proxy thì phải bật `--proxy-headers` +
    `--forwarded-allow-ips` cho uvicorn, nếu không mọi người dùng chung IP của proxy.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method != "POST" or request.url.path != LOGIN_PATH:
            return await call_next(request)
        s = get_settings()
        redis = get_redis()
        key = f"rl:login:{request.client.host if request.client else 'unknown'}"
        async with redis.pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, s.login_rate_window_s, nx=True)
            count, _ = await pipe.execute()
        if count > s.login_rate_limit:
            retry_after = max(await redis.ttl(key), 1)
            exc = RateLimitedError(
                "rate_limited", f"Đăng nhập sai quá nhiều lần, thử lại sau {retry_after} giây"
            )
            return problem_response(request, exc, {"Retry-After": str(retry_after)})
        response = await call_next(request)
        if response.status_code < 400:
            # redis-py 5.x khai báo eval() trả về `Awaitable | str`, từ 6.x mới chỉ là Awaitable:
            # gán qua Any để mypy đúng với cả hai, không cần type: ignore
            pending: Any = redis.eval(_DECR_IF_EXISTS, 1, key)
            await pending
        return response
