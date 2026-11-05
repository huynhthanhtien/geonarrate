# backend

Backend FastAPI kiến trúc 3 lớp cho **Thuyết Minh Tự Động Đa Ngôn Ngữ**: `api → services → repositories`
(+ `core`, `models`, `integrations`, `workers`). Thiết kế: chương 01–04, 09, 10, 12 trong
`docs/system-presentation-thuyet-minh-da-ngon-ngu.html` (mục "Hiện trạng" ghi phần đã làm / chưa làm).

## Hiện trạng

- Endpoint: `GET /healthz` (ping PostgreSQL + Redis), `GET /api/v1/languages`. Khi khởi động app seed 5 ngôn ngữ
  vi/en/zh/ja/ko và chạy nền `MaintenanceService` mỗi giờ (PostgreSQL không có TTL index: tự xoá refresh token hết hạn,
  playback event quá 180 ngày).
- PostgreSQL 16 + PostGIS qua SQLAlchemy Core async (`asyncpg`). Schema ở `core/schema.py`, migration Alembic ở
  `app/migrations/`. Id là UUID; app **không** tự tạo bảng, phải chạy `alembic upgrade head` trước khi khởi động.
- `integrations/tts`: port `TTSProvider` + adapter `EdgeTTS`. `translate/`, `storage/`, `queue/`, `workers/` còn rỗng.
- Identity (S-01): `/api/v1/auth/{login,refresh,logout,logout-all}` (JWT HS256 15 phút + refresh token
  xoay vòng 30 ngày, phát hiện dùng lại; `AuthService.revoke_sessions` thu hồi ngay cả access token qua mốc
  `auth:access_cutoff:{user_id}` trên Redis); bảng vai trò → quyền trong `core/permissions.py`, guard
  `Depends(require_permission(Permission.X))` (`core/deps.py`); rate limit đăng nhập sai 5 lần/phút/IP trên
  Redis (`core/rate_limit.py`); `AuditService.record(actor_id, action, AuditResource(type, id))` cho các
  story sau ghi nhật ký, xem qua `GET /api/v1/audit` (quyền `admin:manage`).
- Chưa có: quản lý tài khoản (S-11), Unit of Work, worker Arq, deploy.

## Chạy dev

```bash
docker compose -f infra/docker-compose.yml up -d --wait   # PostgreSQL 16 + PostGIS + Redis 7
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
cp .env.example .env
.venv/bin/alembic upgrade head                            # tạo/cập nhật schema
.venv/bin/uvicorn app.main:app --reload --port 8000       # http://localhost:8000/docs
```

## Kiểm tra (giống CI)

```bash
.venv/bin/ruff format --check . && .venv/bin/ruff check . && .venv/bin/mypy && .venv/bin/lint-imports
.venv/bin/pytest -q --cov=app --cov-fail-under=85         # cần PostgreSQL + Redis đang chạy (docker compose ở trên)
.venv/bin/pytest -q -m "not integration"                  # chỉ unit test, không cần DB (bỏ qua ngưỡng coverage)
```

`lint-imports` kiểm tra 2 hợp đồng khai báo trong `pyproject.toml`: thứ tự lớp `api → services → repositories`
và `api` không import trực tiếp `repositories`.

`pytest` tự chạy migration trên DB riêng `geonarrate_test` (compose tạo sẵn khi khởi tạo volume) và kiểm tra `schema.py`
khớp migration.

## Đổi schema

```bash
# sửa app/core/schema.py rồi sinh migration, đọc lại file sinh ra trước khi commit
.venv/bin/alembic revision --autogenerate -m "mo ta thay doi"
.venv/bin/alembic upgrade head
.venv/bin/alembic check                                   # không còn lệch giữa schema.py và CSDL
```

## Hợp đồng API với frontend

`backend/openapi.json` **được commit** và là nguồn để `frontend/` sinh `@geonarrate/api-client`
(`pnpm api:generate` trong `frontend/`, commit cùng PR). Sau khi đổi router/schema:

```bash
.venv/bin/python -m app.tools.export_openapi > openapi.json   # rồi commit cùng thay đổi code
```

CI chặn PR nếu `openapi.json` chưa cập nhật (`scripts/check_openapi.sh`) hoặc có breaking change so với nhánh đích (oasdiff).

## Docker image

```bash
docker build -t geonarrate-api .   # multi-stage, python:3.12-slim, có ffmpeg, chạy user non-root
docker run --rm --env-file .env geonarrate-api alembic upgrade head   # chạy migration trước khi deploy
```
