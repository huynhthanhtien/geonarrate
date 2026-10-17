# GeoNarrate

Monorepo cho **Thuyết Minh Tự Động Đa Ngôn Ngữ**.

```
backend/    FastAPI + MongoDB + Redis (Python 3.12) — xem backend/README.md
frontend/   pnpm + Turborepo: apps/web (React), apps/mobile (Expo) — xem frontend/README.md
docs/       tài liệu thiết kế
.github/    CI chung (.github/workflows/ci.yml)
```

## Hợp đồng API

`backend/openapi.json` (sinh từ code FastAPI, được commit) là nguồn duy nhất để `frontend/packages/api-client`
sinh type. Đổi API thì sửa backend, chạy lại export + `pnpm api:generate` trong `frontend/`, commit cả hai trong cùng PR.



## CI

Một workflow, job `changes` quyết định chạy gì:

- sửa `backend/**` → job `backend` (lint, mypy, test, kiểm tra contract + oasdiff breaking change)
- sửa `frontend/**` hoặc `backend/openapi.json` → job `frontend` (kiểm api-client khớp contract, typecheck/test/build)
- job `ci-ok` luôn chạy và tổng hợp kết quả — đặt **chỉ job này** làm required check trong branch protection.


## Tài liệu tham khảo 
[GeoNarrate](https://htmlpreview.github.io/?https://github.com/huynhthanhtien/geonarrate/blob/main/docs/system-presentation-thuyet-minh-da-ngon-ngu.html)
