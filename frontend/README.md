# frontend

Monorepo frontend (pnpm + Turborepo) cho **Thuyết Minh Tự Động Đa Ngôn Ngữ**. Backend nằm ở
`../backend`; thiết kế: chương 05–08, 12 trong `../docs/system-presentation-thuyet-minh-da-ngon-ngu.html`.

```
apps/web             React 19 + Vite — CMS / Studio (port 5173, proxy /api và /healthz → :8000)
apps/mobile          Expo SDK 57 / React Native 0.86 (New Architecture) — app du khách
packages/api-client  client có kiểu (openapi-typescript + openapi-fetch), sinh từ ../backend/openapi.json
packages/core        logic TS thuần: hằng số (chương 12), geofence (Vitest)
packages/tokens      design tokens
packages/config      tsconfig base
```

Hiện trạng: web có 1 trang demo gọi `/healthz` và `/api/v1/languages`; mobile có 1 màn hình demo đọc hằng số
từ `@geonarrate/core`, chưa dùng Expo Router. Chưa có `packages/ui`, `i18n`, `testing` và ESLint/Prettier.

## Chạy

```bash
pnpm install
pnpm --filter web dev                 # cần backend chạy ở :8000 (xem ../backend/README.md)
pnpm --filter mobile start            # Expo dev server (app dùng development build, không chạy trên Expo Go)
pnpm --filter mobile android          # build + cài development build lên máy/emulator Android
```

## Đồng bộ API từ backend

```bash
pnpm api:generate  # sinh lại packages/api-client/src/schema.d.ts từ ../backend/openapi.json
```

Commit `src/schema.d.ts` cùng PR đổi API bên backend. CI chặn nếu type sinh ra không khớp `backend/openapi.json`.

## Kiểm tra (giống CI)

```bash
pnpm turbo run typecheck test build
```

Trên PR, CI chỉ chạy các package bị ảnh hưởng (`--filter='...[origin/<nhánh đích>]'`).

## Ghi chú môi trường

- Node ≥ 22 (`.nvmrc`), pnpm theo `packageManager` trong `package.json`.
- `nodeLinker: hoisted` và `overrides` React 19.2.3 nằm trong `pnpm-workspace.yaml` (React Native yêu cầu).
- Phiên bản TypeScript khác nhau theo package: gốc repo TS 7, `apps/mobile` TS 6 (theo Expo),
  `packages/api-client` TS 5 vì `openapi-typescript` chưa chạy được với TypeScript 7.
- `apps/mobile/android|ios` sinh bởi `expo prebuild`, không commit.
