# GeoNarrate

Hệ thống **thuyết minh tự động đa ngôn ngữ**: đội nội dung soạn kịch bản tiếng Việt trên CMS, hệ thống dịch sang
en/zh/ja/ko và sinh audio; du khách tải pack của tour về điện thoại và nghe tự động khi đi tới từng điểm, kể cả
khi không có mạng. Tour trả phí mở bằng vé QR, du khách không cần tài khoản.

```
backend/    FastAPI + PostgreSQL 16 (PostGIS) + Redis 7, worker nền   → backend/README.md
frontend/   pnpm + Turborepo: apps/web (CMS), apps/mobile (Expo)      → frontend/README.md
.github/    CI (.github/workflows/ci.yml)
```

## Luồng chính

```
Biên tập viên soạn kịch bản ─▶ Admin duyệt ─▶ worker dịch máy ─▶ Biên dịch viên duyệt bản dịch
        │                                                              │
        └──────────────── audio tiếng Việt ◀── worker sinh audio TTS ◀─┘ (tự động sau mỗi lần duyệt)
                                         │
Admin gom điểm thành tour ─▶ build pack theo ngôn ngữ ─▶ QA ─▶ phát hành (rollback được)
                                         │
App du khách: chọn ngôn ngữ ─▶ quét vé QR nếu tour trả phí ─▶ tải pack ─▶ GPS tự phát audio ─▶ gửi số liệu nghe
```

## Chạy toàn bộ trên máy

Cần Docker, Python 3.12, Node ≥ 22 và pnpm.

```bash
# 1. Hạ tầng + backend
cd backend
docker compose -f infra/docker-compose.yml up -d --wait   # PostgreSQL + PostGIS + Redis
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
cp .env.example .env
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000      # API: http://localhost:8000/docs

# 2. Worker nền (terminal khác): dịch, sinh audio, build pack
cd backend && .venv/bin/python -m app.workers.run

# 3. CMS (terminal khác)
cd frontend && pnpm install && pnpm --filter web dev      # http://localhost:5173
```

Đăng nhập CMS bằng tài khoản admin dev trong `backend/.env` (`DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`), được tạo
tự động khi backend khởi động với `APP_ENV=dev`. App di động xem `frontend/README.md`.

## Vai trò

| Vai trò | Làm được |
|---|---|
| `editor` | Xem, thêm và sửa điểm tham quan; soạn và gửi duyệt kịch bản |
| `translator` | Duyệt bản dịch, quản lý thuật ngữ |
| `admin` | Mọi quyền: duyệt kịch bản, Voice Studio, tour, pack, vé QR, analytics, tài khoản, nhật ký |

Bảng quyền nằm ở `backend/app/core/permissions.py`. API là lớp kiểm soát chính; web chỉ ẩn menu cho dễ dùng.

## Hiện trạng

Cả 18 use case trong PRD đã có code. Đã bổ sung LibreTranslate, Azure/Magpie TTS, rate limit API công khai,
mã cài đặt có chữ ký và transaction chung cho thay đổi CMS + audit. COMET QE/ASR WER có thể bật bằng model
cục bộ; không cấu hình thì giữ trạng thái chưa đánh giá. Có kho S3 tùy chọn và Compose chạy API, worker, migration, volume chung.

Chưa thể xác nhận sẵn sàng production: cần tài khoản provider, model đã được cấp quyền và hiệu chỉnh ngưỡng,
kiểm thử GPS/QR/audio/offline trên thiết bị thật, tên miền/TLS và sao lưu. Adapter cloud đã có test giả, chưa kiểm chứng trên tài khoản thật. Xem hướng dẫn cấu hình và triển khai trong `backend/README.md`.

## Hợp đồng API

`backend/openapi.json` được sinh từ code FastAPI để `frontend/packages/api-client` sinh kiểu API.
Sau khi thay đổi schema backend, chạy các lệnh sau từ thư mục `code/`:

```bash
cd backend
.venv/bin/python -m app.tools.export_openapi > openapi.json
cd ../frontend
pnpm api:generate
```

Lệnh đầu cập nhật `backend/openapi.json`; lệnh sau cập nhật `frontend/packages/api-client/src/schema.d.ts`.

## CI

Một workflow; job `changes` quyết định chạy gì:

- sửa `backend/**` → job `backend`: ruff, mypy, lint-imports, pytest (có PostgreSQL + Redis), kiểm tra
  `openapi.json` khớp code, oasdiff chặn breaking change trên PR.
- sửa `frontend/**` hoặc `backend/openapi.json` → job `frontend`: kiểm api-client khớp contract, typecheck, test, build.
- job `ci-ok` luôn chạy và tổng hợp kết quả: đặt **chỉ job này** làm required check trong branch protection.

## Tài liệu

PRD, sơ đồ use case, ERD và lược đồ dữ liệu không nằm trong repo này:

- PRD (Google Docs): https://docs.google.com/document/d/102Hd-duxCrWFMzTJI-Mf2Cs9m58H7J7Li3UfRKv6t48/edit
- Sơ đồ: `geonarrate-diagrams.drawio` (mở bằng https://app.diagrams.net, mỗi trang một sơ đồ)
- ERD dạng DBML: `erd.dbml` (dán vào https://dbdiagram.io)

Nguồn chuẩn của schema là `backend/app/core/schema.py` và migration trong `backend/app/migrations/`.
