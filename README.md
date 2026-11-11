# GeoNarrate

Hệ thống **thuyết minh tự động đa ngôn ngữ**: đội nội dung soạn kịch bản tiếng Việt trên CMS, hệ thống dịch sang
en/zh/ja/ko và sinh audio; du khách tải pack của tour về điện thoại và nghe tự động khi đi tới từng điểm, kể cả
khi không có mạng. Tour trả phí mở bằng vé QR, du khách không cần tài khoản.

```
backend/    FastAPI + PostgreSQL 16 (PostGIS) + Redis 7, worker nền   → backend/README.md
frontend/   pnpm + Turborepo: apps/web (CMS), apps/mobile (Expo)      → frontend/README.md
.github/    CI (.github/workflows/ci.yml) + phát hành APK (release.yml)
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

## Bảng lệnh build / chạy / kiểm tra

Chạy từ thư mục `code/` trừ khi ghi khác. Mỗi khối là một việc riêng.

**Hạ tầng và backend** (`backend/`)

```bash
docker compose -f infra/docker-compose.yml up -d --wait     # bật PostgreSQL + PostGIS + Redis
docker compose -f infra/docker-compose.yml down             # tắt (thêm -v để xoá dữ liệu)
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'  # cài phụ thuộc
cp .env.example .env                                        # rồi điền JWT_SECRET, CLOUDINARY_URL, ...
.venv/bin/alembic upgrade head                              # tạo/cập nhật bảng
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000   # API (0.0.0.0 để điện thoại cùng Wi-Fi gọi được)
.venv/bin/python -m app.workers.run                         # worker dịch, sinh audio, build pack (terminal khác)
.venv/bin/python -m app.tools.create_user a@x.com admin --name "Admin"   # tạo tài khoản
curl http://127.0.0.1:8000/healthz                          # kiểm tra API + PostgreSQL + Redis
```

**Web CMS** (`frontend/`)

```bash
pnpm install
pnpm --filter web dev                       # http://localhost:5173 (proxy /api về :8000)
VITE_USE_MSW=true pnpm --filter web dev     # chạy bằng dữ liệu giả, không cần backend
pnpm --filter web build                     # build production vào apps/web/dist
```

**App di động** (`frontend/`, cần JDK 17 và Android SDK cho các lệnh build)

```bash
pnpm --filter mobile start                  # Expo dev server (không chạy được trên Expo Go)
pnpm --filter mobile android                # build development build và cài lên máy/máy ảo Android

# APK release build trên máy (ký bằng debug keystore, dùng để thử)
cd apps/mobile
EXPO_PUBLIC_API_URL=http://<IP-LAN>:8000 pnpm exec expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease
# kết quả: apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

`EXPO_PUBLIC_API_URL` được đóng vào APK. Địa chỉ `http://` chỉ nhận IP mạng nội bộ (`192.168.x.x`, `10.x.x.x`,
`172.16–31.x.x`) và chính IP này mới nhập được trong màn hình **Máy chủ** của app; địa chỉ công khai bắt buộc `https://`.
Đổi IP máy thì phải build lại APK. Xem IP LAN: `ip -4 addr show scope global`.

**Kiểm tra (giống CI)**

```bash
# backend/   (cần PostgreSQL + Redis đang chạy; đặt TRANSLATE_PROVIDER=mock TTS_PROVIDER=edge để giống CI)
.venv/bin/ruff format --check . && .venv/bin/ruff check .
.venv/bin/mypy
.venv/bin/lint-imports
.venv/bin/pytest -q --cov=app --cov-fail-under=85
.venv/bin/python -m app.tools.export_openapi | diff - openapi.json    # openapi.json phải khớp code

# frontend/
pnpm turbo run typecheck test build
pnpm api:generate && git diff --exit-code -- packages/api-client/src   # api-client phải khớp openapi.json
```

**Đổi API backend**: chạy lại `export_openapi > openapi.json` rồi `pnpm api:generate`, commit cả hai. Nếu đổi có chủ ý
làm hỏng client cũ (đổi/xoá trường), gắn nhãn `breaking-change` cho PR để CI bỏ qua bước oasdiff.

**Phát hành APK trên GitHub** (`release.yml`)

```bash
# 1. Một lần: Settings → Secrets and variables → Actions → Variables → EXPO_PUBLIC_API_URL
gh variable set EXPO_PUBLIC_API_URL --body "http://<IP-LAN>:8000"     # hoặc https://api.example.com khi phát hành thật

# 2a. Phát hành bằng tag (merge vào main KHÔNG tự phát hành)
git switch main && git pull
git tag v1.0.0 && git push origin v1.0.0
# 2b. Hoặc chạy tay
gh workflow run release.yml --ref main -f version=1.0.0

gh run list --workflow release.yml --limit 3                          # xem tiến độ
gh release list                                                        # xem bản đã phát hành
```

Version có dấu `-` (ví dụ `0.1.0-test.1`) được đánh dấu là prerelease. Không đặt secret keystore thì APK ký bằng
debug keystore, chỉ để thử.

**Triển khai bằng Docker** (`backend/`, chi tiết trong `backend/README.md`)

```bash
docker build -t geonarrate-api .
docker compose --env-file .env -f infra/compose.deploy.yml up -d --build --wait
docker compose --env-file .env -f infra/compose.deploy.yml exec api python -m app.tools.create_user admin@example.com admin --name "Admin"
```

**Gặp lỗi thường gặp**

- App báo "địa chỉ máy chủ không hợp lệ": APK chưa được build với `EXPO_PUBLIC_API_URL` đúng IP; nhập đủ `http://IP:8000`.
- Điện thoại không vào được backend: cùng Wi-Fi, API chạy `--host 0.0.0.0`, firewall mở cổng 8000; thử mở
  `http://<IP-LAN>:8000/healthz` bằng trình duyệt điện thoại.
- Workflow release dừng ở "Kiểm tra URL API": chưa đặt biến `EXPO_PUBLIC_API_URL`.
- Upload ảnh trả 503 `image_upload_disabled`: chưa điền `CLOUDINARY_URL` trong `backend/.env`.

## Vai trò

| Vai trò | Làm được |
|---|---|
| `editor` | Xem, thêm và sửa điểm tham quan (kể cả ảnh); soạn và gửi duyệt kịch bản; quản lý tour |
| `reviewer` | Duyệt hoặc trả lại kịch bản; xem nội dung và pack |
| `translator` | Sửa và duyệt bản dịch, quản lý thuật ngữ |
| `operator` | Sinh lại audio, build/phát hành/rollback pack, quản lý vé QR, xem analytics |
| `admin` | Mọi quyền (21 quyền), gồm tài khoản và nhật ký |

Bảng quyền nằm ở `backend/app/core/permissions.py`. API là lớp kiểm soát chính; web chỉ ẩn menu cho dễ dùng.

## Hiện trạng

Cả 18 use case trong PRD đã có code. Đã bổ sung LibreTranslate, MagpieTTS tự host, rate limit API công khai,
mã cài đặt có chữ ký và transaction chung cho thay đổi CMS + audit. Audio và pack lưu trên volume local; Compose chạy API, worker, migration, volume chung.

Chưa thể xác nhận sẵn sàng production: cần tài khoản provider dịch,
kiểm thử GPS/QR/audio/offline trên thiết bị thật, tên miền/TLS và sao lưu. Xem hướng dẫn cấu hình và triển khai trong `backend/README.md`.

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

Workflow `ci.yml`; job `changes` quyết định chạy gì:

- sửa `backend/**` → job `backend`: ruff, mypy, lint-imports, pytest (có PostgreSQL + Redis), kiểm tra
  `openapi.json` khớp code, oasdiff chặn breaking change trên PR.
- sửa `frontend/**` hoặc `backend/openapi.json` → job `frontend`: kiểm api-client khớp contract, typecheck, test, build.
- job `ci-ok` luôn chạy và tổng hợp kết quả: đặt **chỉ job này** làm required check trong branch protection.

## Phát hành APK (GitHub Releases)

Workflow `.github/workflows/release.yml` build APK và tạo GitHub Release khi push tag `v*`, hoặc chạy tay từ
tab Actions. VersionName lấy từ tag, versionCode lấy `github.run_number`.

Cấu hình một lần ở **Settings → Secrets and variables → Actions**:

- **Variable** `EXPO_PUBLIC_API_URL`: địa chỉ API đóng vào APK (dùng HTTPS khi phát hành thật).
- **Secrets** (tuỳ chọn): `ANDROID_KEYSTORE_BASE64` (file `.jks` mã hoá base64), `ANDROID_STORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Không cấu hình thì APK ký bằng debug keystore — chỉ để thử nghiệm.

```bash
git tag v1.0.0
git push origin v1.0.0
```

Release có `geonarrate-<version>.apk` và file `.sha256` để kiểm tra tải xuống.

## Tài liệu

PRD, sơ đồ use case, ERD và lược đồ dữ liệu không nằm trong repo này:

- PRD (Google Docs): https://docs.google.com/document/d/102Hd-duxCrWFMzTJI-Mf2Cs9m58H7J7Li3UfRKv6t48/edit
- Sơ đồ: `geonarrate-diagrams.drawio` (mở bằng https://app.diagrams.net, mỗi trang một sơ đồ)
- ERD dạng DBML: `erd.dbml` (dán vào https://dbdiagram.io)

Nguồn chuẩn của schema là `backend/app/core/schema.py` và migration trong `backend/app/migrations/`.
