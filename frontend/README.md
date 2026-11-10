# frontend

Monorepo pnpm + Turborepo. Backend nằm ở `../backend`.

```
apps/web             React 19 + Vite + Tailwind: CMS / Studio (port 5173, proxy /api và /healthz → :8000)
apps/mobile          Expo SDK 57 / React Native 0.86: app du khách
packages/api-client  client có kiểu (openapi-typescript + openapi-fetch), sinh từ ../backend/openapi.json
packages/core        logic TS thuần: hằng số, chọn geofence, GeofenceTracker (Vitest)
packages/tokens      design tokens dùng chung web và mobile
packages/config      tsconfig base
```

## CMS (`apps/web`)

```bash
pnpm install
pnpm --filter web dev        # cần backend ở :8000 và worker đang chạy (xem ../backend/README.md)
```

| Trang | Use case |
|---|---|
| Điểm tham quan, sửa điểm, soạn kịch bản | UC-02, UC-03 |
| Duyệt script | UC-04 |
| Bản dịch, Thuật ngữ | UC-05, UC-06 |
| Voice Studio: trạng thái audio từng điểm × ngôn ngữ, thử lại | UC-07 |
| Tour, Pack (build, phát hành, rollback) | UC-08 đến UC-10 |
| Vé QR: phát hành theo lô kèm mã QR để in, tra cứu, thu hồi | UC-13 |
| Analytics, Tài khoản, Nhật ký | UC-14, UC-11, UC-12 |

Menu hiện theo quyền trong token. Các trang gọi API qua `sendJson` trong `src/api.ts` (tự gắn access token, tự
refresh khi hết hạn).

Trang **Điểm tham quan** có chế độ bản đồ/danh sách, lọc danh mục và trạng thái. Marker đánh số, màu theo
trạng thái duyệt; vòng tròn là bán kính tự phát. Chọn điểm trên bản đồ hoặc bảng bên cạnh để xem tọa độ và mở
sửa điểm/kịch bản theo quyền. Form điểm đồng bộ tọa độ nhập, click/kéo marker và vòng bán kính. Form tour
hiện các điểm đã chọn, nối nét đứt để xem bố trí (không phải chỉ đường). Bản đồ dùng MapLibre + OpenFreeMap,
cần mạng để tải bản đồ nền; khi lỗi vẫn có thể dùng danh sách và nhập tọa độ.

Trang **Nhật ký** chọn người theo tên/email, hành động và loại đối tượng; lọc loại không cần biết mã.
Tìm từ khoá trên tên/email người thao tác, ghi chú, mã đối tượng và mã hành động; tìm trên toàn bộ dữ liệu phía
server. Chọn ngày bao gồm cả ngày kết thúc theo múi giờ trình duyệt, hoặc dùng Hôm nay/7 ngày/30 ngày.
Mã đối tượng chính xác là tuỳ chọn nâng cao. Áp dụng/xoá bộ lọc đưa về trang đầu; phân trang dùng thời điểm
và ID để không bỏ sót các thao tác trùng thời điểm.

Chạy không cần backend bằng dữ liệu giả (MSW), chỉ cho trang điểm tham quan và duyệt script:

```bash
VITE_USE_MSW=true pnpm --filter web dev    # đăng nhập admin@test.com hoặc editor@test.com, mật khẩu: password
```

## App du khách (`apps/mobile`)

Luồng có vé: chọn ngôn ngữ → **Quét vé QR** trên trang chủ → mở tour trong vé → tải pack → nghe.
Nếu vé có nhiều tour đang phát hành, app chỉ hiện các tour trong vé để chọn. Trang chủ vẫn liệt kê
tour miễn phí và tour đã tải để mở trực tiếp.
Khi nghe, app theo dõi GPS 5 giây một lần và tự phát khi ở trong vùng của một điểm đủ 4 giây, mỗi điểm chờ
10 phút mới phát lại (`GeofenceTracker` trong `packages/core`). Không có quyền vị trí thì chọn điểm thủ công.

- Pack tải về `Paths.document`, tối đa 4 file song song, kiểm tra SHA-256 từng file; file đã tải đúng thì không
  tải lại. Giới hạn 3 pack và 1,5 GB trên máy.
- SQLite lưu ngôn ngữ, `device_id`, pack đã tải và sự kiện nghe chờ gửi; sự kiện được gửi lại khi có mạng.
- `device_id`: mã cài đặt ngẫu nhiên có chữ ký do `POST /public/devices` cấp; cần mạng ở lần đăng ký đầu.
  App lưu mã theo địa chỉ máy chủ và gộp các yêu cầu đăng ký đồng thời. Bản cũ dùng mã phần cứng cần kích hoạt lại vé.

```bash
pnpm --filter mobile android    # build + cài development build lên máy hoặc máy ảo Android
pnpm --filter mobile start      # Expo dev server; không chạy trên Expo Go (có module native)
```

Trong app, mở **Máy chủ** để kiểm tra và lưu địa chỉ backend. Android dùng
`http://10.0.2.2:8000` cho máy ảo, hoặc `http://127.0.0.1:8000` nếu đã chạy
`adb reverse tcp:8000 tcp:8000` qua USB. Với điện thoại cùng Wi-Fi, build app bằng
`EXPO_PUBLIC_API_URL=http://<IP-LAN>:8000` và chạy API với `--host 0.0.0.0` trên mạng dev
để web trên PC vẫn gọi được qua `127.0.0.1:8000`. Nếu API chỉ lắng nghe trên IP LAN,
khởi động lại web với `BACKEND_PROXY_URL=http://<IP-LAN>:8000 pnpm --filter web dev`.
Khi đổi IP LAN cho kết nối HTTP, cần tạo lại bản Android. URL HTTPS có thể nhập trực tiếp trong app.

**Chưa chạy thử trên thiết bị**: GPS, quét QR, phát audio và tải offline mới qua typecheck và đóng gói.
Trên Android, mở tour và chọn **Tải bản đồ offline** khi có Internet. App lưu nền đường phố quanh
các điểm dừng; audio được tải riêng. Khi mất mạng, mở tour từ **Đã tải về máy** để dùng cả hai.
Ngoài vùng đã tải hoặc nếu không tải được bản đồ, có thể dùng sơ đồ tour.
Trên Android, trong trình nghe, cấp quyền vị trí rồi chọn **Bật tự phát khi khóa màn hình**.
App dùng dịch vụ vị trí có thông báo để tự phát các đoạn đã lưu. Chọn **Kết thúc tour** để dừng GPS và audio.
Nếu dịch vụ không khởi động được, app chỉ theo dõi khi màn hình nghe đang mở.
Hạn chế đã biết: giao diện chỉ có tiếng Việt, chưa tự báo khi có pack mới.

## Đồng bộ API từ backend

```bash
pnpm api:generate   # sinh lại packages/api-client/src/schema.d.ts từ ../backend/openapi.json
```

Commit `src/schema.d.ts` cùng PR đổi API bên backend. CI chặn nếu type sinh ra không khớp `backend/openapi.json`.

## Kiểm tra (giống CI)

```bash
pnpm turbo run typecheck test build
```

Trên PR, CI chỉ chạy package bị ảnh hưởng (`--filter='...[origin/<nhánh đích>]'`). Web chưa có test tự động; test
hiện có nằm ở `packages/core`.

## Ghi chú môi trường

- Node ≥ 22 (`.nvmrc`), pnpm theo `packageManager` trong `package.json`.
- `nodeLinker: hoisted` và `overrides` React 19.2.3 nằm trong `pnpm-workspace.yaml` (React Native yêu cầu).
- Thêm package cho mobile bằng `pnpm exec expo install <package>` trong `apps/mobile` để lấy đúng phiên bản theo SDK.
- Phiên bản TypeScript khác nhau theo package: gốc repo TS 7, `apps/mobile` TS 6 (theo Expo),
  `packages/api-client` TS 5 vì `openapi-typescript` chưa chạy với TypeScript 7.
- `apps/mobile/android|ios` sinh bởi `expo prebuild`, không commit.
