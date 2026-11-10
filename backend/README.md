# backend

FastAPI, kiến trúc 3 lớp `api → services → repositories` (cùng `core`, `models`, `integrations`, `workers`).
PostgreSQL 16 + PostGIS qua SQLAlchemy Core async (`asyncpg`), Redis 7, migration bằng Alembic.

```
app/api/v1/routers/   HTTP: auth, audit, languages, pois, studio (CMS), public (app di động)
app/services/         nghiệp vụ; PipelineService là phần worker chạy
app/repositories/     truy vấn SQL; job_repo tạo job trong cùng transaction với thao tác nghiệp vụ
app/core/             config, schema.py, kết nối DB/Redis, bảo mật, phân quyền, dependency
app/integrations/     cổng ra ngoài: tts (Edge, Magpie, Azure), translate (mock, LibreTranslate), storage (local hoặc S3)
app/workers/run.py    worker nền
app/migrations/       Alembic
app/tools/            create_user, export_openapi
```

`lint-imports` giữ đúng chiều phụ thuộc: `api → services → repositories`, và `api` không import `repositories`.

## Chạy dev

```bash
docker compose -f infra/docker-compose.yml up -d --wait   # PostgreSQL 16 + PostGIS, Redis 7
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
cp .env.example .env
.venv/bin/alembic upgrade head                            # app không tự tạo bảng
.venv/bin/uvicorn app.main:app --reload --port 8000       # http://localhost:8000/docs
.venv/bin/python -m app.workers.run                       # terminal khác
```

Khi khởi động, app seed 5 ngôn ngữ (vi, en, zh, ja, ko) và tài khoản admin dev nếu `APP_ENV=dev`. Tạo thêm tài
khoản bằng trang **Tài khoản** trên CMS hoặc dòng lệnh:

```bash
.venv/bin/python -m app.tools.create_user editor@geonarrate.test editor --name "Biên tập viên"
```

## Cấu hình (`.env`)

| Biến | Ý nghĩa |
|---|---|
| `DATABASE_URL` | PostgreSQL, dạng `postgresql+asyncpg://...` |
| `REDIS_URL` | Redis: rate limit đăng nhập và mốc thu hồi phiên |
| `JWT_SECRET` | Khoá ký access token; thiếu thì app không khởi động |
| `STORAGE_DIR` | Thư mục lưu audio/pack hoặc cache khi dùng S3 (mặc định `./var/storage`) |
| `STORAGE_PROVIDER`, `S3_BUCKET`, `S3_ENDPOINT_URL` | `local` hoặc `s3`; endpoint để trống khi dùng AWS S3 |
| `TRANSLATE_PROVIDER` | `mock`, `libretranslate` hoặc `groq` để dịch thật bằng Groq |
| `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY` | Instance dịch phải hỗ trợ đủ vi → en/zh/ja/ko; thuật ngữ được QA kiểm tra trước khi duyệt |
| `GROQ_API_KEY`, `GROQ_MODEL` | Khóa Groq chỉ đặt ở backend; model mặc định `openai/gpt-oss-20b`. Thuật ngữ CMS được đưa vào hướng dẫn dịch và vẫn qua bước duyệt |
| `TTS_PROVIDER` | `edge`, `magpie` hoặc `azure` |
| `MAGPIE_TTS_URL`, `MAGPIE_TTS_VOICE` | Máy chủ Magpie có endpoint `/v1/audio/speech`, trả WAV; cần ffmpeg để đổi MP3 |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | Bắt buộc khi dùng Azure TTS |
| `COMET_MODEL`, `WHISPER_MODEL` | Model QE và ASR tùy chọn; rỗng là chưa chấm, điểm lưu `NULL` |
| `CORS_ORIGINS` | Mảng JSON origin của CMS, ví dụ `["https://cms.example.com"]` |
| `PUBLIC_RATE_LIMIT`, `PUBLIC_ACTIVATE_RATE_LIMIT`, `PUBLIC_RATE_WINDOW_S` | Theo IP: mặc định 300 request và 10 lần kích hoạt trong 60 giây |
| `APP_ENV`, `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD` | Chỉ dev: tạo sẵn một tài khoản admin |

## Chạy MagpieTTS cục bộ

Worker gọi NeMo Speech qua HTTP và dùng `ffmpeg` để lưu MP3 mono 48 kbps. Với cả năm
ngôn ngữ, dùng NeMo-Speech.cpp v0.3.0 build với
`NEMO_SPEECH_BUILD_HTTP=ON`, `NEMO_SPEECH_TTS_WITH_ZH=ON` và
`NEMO_SPEECH_TTS_WITH_JA=ON`.
Xem [hướng dẫn build NeMo Speech](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/v0.3.0/docs/build.md).

Cài runtime vào `var/nemo-speech-cjk` rồi tải model một lần từ thư mục backend:

```bash
NEMO_SPEECH_MODEL_DIR="$PWD/var/nemo-models" var/nemo-speech-cjk/bin/nemo-speech pull magpie
```

Đặt `TTS_PROVIDER=magpie` trong `.env` và chạy `.venv/bin/python -m app.workers.run`.
Với URL Magpie local mặc định, worker tự khởi động Magpie và đợi nó sẵn sàng.
Worker dùng từ điển `open_jtalk_dic` và `mandarin_g2p` trong `var/nemo-speech-cjk/share/nemo-speech`.
Nếu cài ở chỗ khác, đặt `MAGPIE_OPENJTALK_DIC_DIR` và `MAGPIE_MANDARIN_G2P_DIR` trong môi trường
của dịch vụ. Nếu dùng dịch vụ Magpie riêng, đặt hai biến trên cho tiến trình NeMo Speech.
Khi chạy nhiều worker, dùng một dịch vụ Magpie riêng và đặt `MAGPIE_TTS_AUTOSTART=false`
để dịch vụ có thể chạy độc lập. Docker Compose dùng dịch vụ `magpie` trong stack.
`MAGPIE_TTS_VOICE` mặc định là `Aria`.

Worker mặc định dùng `MAGPIE_TTS_DEVICE=cpu`. Để dùng CUDA, build NeMo-Speech.cpp với
`-DGGML_CUDA=ON` cùng các tùy chọn HTTP, JA và ZH ở trên, cài vào
`var/nemo-speech-cjk-cuda`, rồi đặt `MAGPIE_TTS_DEVICE=cuda`. Hai runtime dùng chung
model trong `var/nemo-models`; bản CPU vẫn chạy được khi chưa cài CUDA.

## API

Tất cả nằm dưới `/api/v1`. Lỗi trả theo RFC 7807 (`application/problem+json`). Danh sách đầy đủ ở `/docs`.

| Nhóm | Endpoint | Quyền |
|---|---|---|
| Đăng nhập (UC-01) | `POST /auth/login`, `/refresh`, `/logout`, `/logout-all` | — |
| Điểm, kịch bản (UC-02, 03, 04) | `GET/POST /pois`, `GET/PATCH /pois/{id}`, `PUT .../script`, `POST .../{submit,approve,reject}` | `poi:read`, `script:write`; duyệt cần `admin:manage` |
| Bản dịch (UC-05) | `GET /translations`, `PUT /translations/{id}`, `POST .../{approve,reject}` | `translation:review` |
| Thuật ngữ (UC-06) | `GET/POST /glossaries`, `DELETE /glossaries/{id}` | `translation:review` |
| Audio (UC-07) | `GET /audio/status`, `POST /audio/retry` | `audio:build` |
| Tour (UC-08) | `GET/POST /tours`, `GET/PATCH /tours/{id}` | `admin:manage` |
| Pack (UC-09, 10) | `GET /packs`, `POST /packs/build`, `POST /packs/{id}/{publish,rollback}` | build cần `audio:build`, còn lại `pack:publish` |
| Tài khoản (UC-11) | `GET/POST /admin/users`, `PATCH /admin/users/{id}` | `admin:manage` |
| Nhật ký (UC-12) | `GET /audit` (người, hành động, loại/mã đối tượng, từ khoá, khoảng ngày) | `admin:manage` |
| Vé QR (UC-13) | `POST /tickets`, `GET /tickets?q=`, `POST /tickets/revoke` | `admin:manage` |
| Analytics (UC-14) | `GET /analytics/summary` | `analytics:view` |
| App di động (UC-15 đến 18) | `GET /public/tours`, `POST /public/tickets/activate`, `GET /public/tours/{id}/packs/{lang}`, `GET .../files/{poi_id}`, `POST /public/playback-events` | Không đăng nhập; `device_id` do máy chủ cấp qua `POST /public/devices` |

## Pipeline nội dung

- Duyệt kịch bản tạo job dịch cho mỗi ngôn ngữ đích và job audio tiếng Việt; duyệt bản dịch tạo job audio cho
  ngôn ngữ đó. Job được ghi **trong cùng transaction** với thao tác duyệt nên không thể bị mất.
- Job trùng đang `queued` hoặc `running` bị bỏ qua nhờ partial unique index trên `dedupe_key`.
- Worker lấy job bằng `FOR UPDATE SKIP LOCKED`, nên chạy nhiều worker cùng lúc vẫn an toàn. Job lỗi được thử lại
  tối đa 3 lần, chờ 15 giây rồi 60 giây (`jobs.run_after`); job kẹt ở `running` quá 10 phút được đưa về hàng đợi.
- Audio được dùng lại nếu đã có file cùng `text_hash`. Build pack chỉ chạy khi mọi điểm đã có audio khớp nội dung
  đã duyệt hiện tại; pack gồm `manifest.json` và `pack.zip`, kiểm tra checksum trước khi chuyển sang `qa`.
- Phát hành và rollback đổi trạng thái pack trong một transaction; mỗi tour × ngôn ngữ chỉ có một bản `published`.
- PostgreSQL không có TTL index: `MaintenanceService` chạy mỗi giờ trong tiến trình API để xoá refresh token hết
  hạn và sự kiện nghe quá 180 ngày.

## Chất lượng nội dung

Cài thêm `pip install -e '.[quality]'` trên worker và đặt `COMET_MODEL` thành model COMET QE không cần
reference, `WHISPER_MODEL` thành tên hoặc thư mục model faster-whisper. Worker chạy model CPU trong thread;
model được nạp một lần và có thể cần tải trọng số ở lần chạy đầu. Chọn model phù hợp tài nguyên và quyền sử dụng.
Ví dụ CometKiwi yêu cầu chấp nhận điều kiện truy cập và giấy phép trên
[model card](https://huggingface.co/Unbabel/wmt22-cometkiwi-da).

Điểm QE được lưu cùng bản dịch, hiển thị trên CMS; dưới `COMET_QE_MIN` sẽ gắn cờ `low_comet_qe` để người dịch
kiểm tra. Sửa bản dịch xoá điểm cũ vì điểm không còn khớp nội dung. Audio có ASR WER vượt `ASR_WER_MAX` sẽ
làm job thất bại, không được đưa vào pack. Phép so sánh chuẩn hoá hoa/thường, dấu câu, Unicode; tiếng Trung/Nhật
tách ký tự nên kết quả gần CER, cần hiệu chỉnh ngưỡng trên tập kiểm thử thực tế. Chưa bật model thì không chấm.
Model lỗi sẽ làm job thử lại, không tự bỏ qua đánh giá đã cấu hình.

Các request CMS dùng một transaction chung cho nghiệp vụ, job và nhật ký, commit trước khi gửi response.
Lỗi ghi audit sẽ hoàn tác nghiệp vụ. Luồng auth có transaction riêng để việc thu hồi token khi phát hiện dùng
lại refresh token vẫn được lưu dù API trả lỗi.

Mã thiết bị là thông tin xác thực cài đặt ngẫu nhiên có HMAC, không phải chứng thực phần cứng. App đăng ký một
lần khi có mạng rồi lưu lại. Không ghi mã này vào log hoặc chia sẻ; đổi `JWT_SECRET` làm các mã đã cấp mất hiệu lực.
App cũ dùng mã phần cứng cần nâng cấp và kích hoạt lại vé; lượt chuyển thiết bị của vé vẫn áp dụng.

## Kiểm tra (giống CI)

```bash
.venv/bin/ruff format --check . && .venv/bin/ruff check . && .venv/bin/mypy && .venv/bin/lint-imports
.venv/bin/pytest -q --cov=app --cov-fail-under=85   # cần PostgreSQL + Redis đang chạy
.venv/bin/pytest -q -m "not integration"            # chỉ unit test, không cần DB
```

`pytest` tự chạy migration trên DB riêng `geonarrate_test` (compose tạo khi khởi tạo volume), kiểm tra `schema.py`
khớp migration, và chạy nguyên chuỗi duyệt → dịch → audio → pack → vé → tải pack với TTS giả.

`pyproject.toml` không khoá phiên bản, nên CI có thể cài thư viện mới hơn máy bạn. Nếu CI lỗi mà máy bạn chạy
qua, hãy cập nhật venv: `.venv/bin/pip install -U -e '.[dev]'`.

## Đổi schema

Migration `0004` đổi tên các bảng điểm tham quan và bảng nối tour sang `pois`, `tour_pois`,
và các khóa ngoại liên quan thành `poi_id`. API v1, web và ứng dụng dùng tên POI;
phiên bản web và APK cũ cần được cập nhật cùng backend.
PostgreSQL chặn `DELETE` và `TRUNCATE` trực tiếp trên `pois`. Để bỏ một điểm khỏi tour, sửa danh
sách điểm của tour; thao tác này chỉ bỏ liên kết và giữ lại POI, bản dịch và audio.
Migration `0005` dùng `ON DELETE RESTRICT` cho toàn bộ khóa ngoại. PostgreSQL từ chối
`DELETE` bản ghi cha còn được tham chiếu, thay vì tự xóa bản ghi con hoặc tự bỏ liên kết.
Migration `0006` bỏ cột `slug` trên POI và tour; dùng UUID để tra cứu. Tên hiển thị có thể trùng.

```bash
# sửa app/core/schema.py, rồi sinh migration và đọc lại file sinh ra trước khi commit
.venv/bin/alembic revision --autogenerate -m "mo ta thay doi"
.venv/bin/alembic upgrade head
.venv/bin/alembic check                             # không còn lệch giữa schema.py và CSDL
```

## Hợp đồng API với frontend

```bash
.venv/bin/python -m app.tools.export_openapi > openapi.json   # commit cùng thay đổi code
```

Sau đó chạy `pnpm api:generate` trong `frontend/`. CI chặn PR nếu `openapi.json` cũ hơn code
(`scripts/check_openapi.sh`) hoặc có breaking change so với nhánh đích (oasdiff).

## Docker image

```bash
docker build -t geonarrate-api .                                        # python:3.12-slim, user non-root
docker run --rm --env-file .env geonarrate-api alembic upgrade head     # migration trước khi deploy
```

Image tạo sẵn thư mục storage có quyền ghi cho user `app` (UID 10001). API và worker phải dùng chung volume.

## Triển khai một máy chủ

Từ `backend/`, tạo `.env` từ `.env.example`, đặt `JWT_SECRET` ngẫu nhiên ít nhất 32 byte và thêm
`POSTGRES_PASSWORD` (dùng chuỗi hex để an toàn trong URL). Chọn nhà cung cấp dịch/TTS, cấu hình origin CMS;
production không seed tài khoản dev. Không đưa `.env` vào Git.

Đặt `TTS_PROVIDER=magpie` để worker dùng Magpie v2607 trong Compose. Lần khởi động đầu,
dịch vụ `magpie` tải model vào volume `magpie-models`. Worker đợi dịch vụ sẵn sàng
và gọi `http://magpie:8080` qua mạng nội bộ của Compose.

```bash
docker compose --env-file .env -f infra/compose.deploy.yml config --quiet
docker compose --env-file .env -f infra/compose.deploy.yml up -d --build --wait
docker compose --env-file .env -f infra/compose.deploy.yml exec api python -m app.tools.create_user admin@example.com admin --name "Admin"
curl --fail http://127.0.0.1:8000/healthz
```

Compose đợi PostgreSQL/Redis sẵn sàng và migration thành công rồi mới chạy API/worker. Dữ liệu DB, Redis và
file nằm trong các named volume; model có volume cache riêng; API chỉ mở cổng loopback 8000. Đặt reverse proxy HTTPS phía trước; cấu hình
uvicorn chỉ tin `X-Forwarded-For` từ IP proxy thực tế để rate limit phân biệt được người dùng. Không tin header
forwarded từ Internet. CMS build bằng `pnpm --filter web build`, phục vụ `frontend/apps/web/dist` dưới cùng
origin với `/api/` và `/healthz` được proxy tới API. App mobile đặt `EXPO_PUBLIC_API_URL` thành URL HTTPS này
khi build.

Sao lưu cả PostgreSQL và volume storage cùng đợt. Trước nâng cấp: sao lưu, build image mới, chạy migration,
kiểm tra health và luồng phát hành/tải pack. Nếu cần quay lại, dùng image cũ cùng bản sao dữ liệu tương ứng;
không tự downgrade schema đang có dữ liệu production. Không xoá volume khi dừng stack.

Nếu bật model chất lượng trong Docker, đặt `PYTHON_EXTRAS=[quality]` trong `.env` trước khi build.
Volume model được mount vào `HF_HOME`, có quyền ghi cho UID 10001. Image mặc định chỉ cài dependency nhẹ. Chưa triển khai lên máy chủ thật hay kiểm thử model/provider có tài khoản.

## Kho S3

Cài extra `cloud` (hoặc `PYTHON_EXTRAS=[cloud,quality]` khi build Docker), đặt `STORAGE_PROVIDER=s3`,
`S3_BUCKET` và nếu cần `S3_ENDPOINT_URL` cho dịch vụ tương thích S3. SDK dùng IAM role hoặc biến môi trường
AWS tiêu chuẩn; không đưa credential vào source. API và worker dùng cùng bucket. Cấp quyền đọc/ghi object
và kiểm tra tồn tại; giữ bucket riêng tư. Các file vẫn đi qua API kiểm tra vé, không trả URL bucket công khai.

Worker ghi lên S3 trước khi công nhận asset; API tải file về cache khi cần. Cache được ghi nguyên tử để tránh
phục vụ file đang ghi dở. Khi chuyển từ local sang S3, sao chép cả cây storage lên bucket, giữ nguyên key trước
khi đổi cấu hình. Tự quản lý dung lượng cache, lifecycle và versioning/backup bucket theo môi trường triển khai.
Adapter đã có test với S3 giả, chưa chạy với tài khoản cloud thật.

## Giới hạn còn lại

Cần cấu hình tài khoản dịch/TTS/cloud,
trọng số model, tên miền/TLS và sao lưu cho môi trường thật. GPS, QR, audio và offline cần nghiệm thu trên
thiết bị; các test pipeline tự động dùng provider giả, không chứng minh chất lượng model hay dịch vụ thật.
