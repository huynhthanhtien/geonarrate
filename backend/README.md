# backend

Backend FastAPI kiến trúc 3 lớp cho **Thuyết Minh Tự Động Đa Ngôn Ngữ**: `api → services → repositories`
(+ `core`, `models`, `integrations`, `workers`). Thiết kế: chương 01–04, 09, 10, 12 trong
`docs/system-presentation-thuyet-minh-da-ngon-ngu.html` (mục "Hiện trạng" ghi phần đã làm / chưa làm).

## Hiện trạng

- Endpoint: `GET /healthz` (ping Mongo + Redis), `GET /api/v1/languages`. Khi khởi động app tạo index
  (`core/database.py::ensure_indexes`) và seed 5 ngôn ngữ vi/en/zh/ja/ko.
- MongoDB qua PyMongo Async API (`AsyncMongoClient`), không dùng Motor/Beanie.
- `integrations/tts`: port `TTSProvider` + adapter `EdgeTTS`. `translate/`, `storage/`, `queue/`, `workers/` còn rỗng.
- Chưa có: auth/RBAC (`core/security.py`), Unit of Work, worker Arq, deploy.

## Chạy dev

```bash
docker compose -f infra/docker-compose.yml up -d --wait   # MongoDB 7 (replica set rs0) + Redis 7
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload --port 8000       # http://localhost:8000/docs
```

## Kiểm tra (giống CI)

```bash
.venv/bin/ruff format --check . && .venv/bin/ruff check . && .venv/bin/mypy && .venv/bin/lint-imports
.venv/bin/pytest -q --cov=app --cov-fail-under=85         # cần Mongo + Redis đang chạy (docker compose ở trên)
.venv/bin/pytest -q -m "not integration"                  # chỉ unit test, không cần DB (bỏ qua ngưỡng coverage)
```

`lint-imports` kiểm tra 2 hợp đồng khai báo trong `pyproject.toml`: thứ tự lớp `api → services → repositories`
và `api` không import trực tiếp `repositories`.

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
```
