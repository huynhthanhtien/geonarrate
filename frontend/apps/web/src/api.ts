import { createApiClient } from "@geonarrate/api-client";
import { authFetch } from "./auth/session";

/** Client dùng chung cho mọi trang — tự gắn access token và tự refresh khi hết hạn. */
export const api = createApiClient("", { fetch: authFetch });

/** Lấy thông báo lỗi để hiển thị: `detail` của backend, lỗi validate (mảng) thì dùng câu chung. */
async function errorMessage(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  if (typeof body === "object" && body !== null && "detail" in body && typeof body.detail === "string") {
    return body.detail;
  }
  return res.status === 422 ? "Dữ liệu không hợp lệ" : `Yêu cầu thất bại (HTTP ${res.status})`;
}

/** Gọi API có token cho các trang chưa dùng api-client; lỗi HTTP ném ra để trang hiển thị. */
export async function sendJson<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await authFetch(
    new Request(url, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    })
  );
  if (!res.ok) throw new Error(await errorMessage(res));
  if (res.status === 204 || res.status === 205) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Máy chủ trả về dữ liệu không đúng định dạng (HTTP ${res.status}).`);
    }
    throw error;
  }
}

export async function getAudioPreview(poiId: string, lang: string, signal: AbortSignal): Promise<Blob> {
  const path = `/api/v1/audio/${encodeURIComponent(poiId)}/${encodeURIComponent(lang)}/preview`;
  const response = await authFetch(new Request(path, { signal }));
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.blob();
}

/** Tải 1 ảnh lên (qua backend → Cloudinary) và trả URL để lưu vào điểm. */
export async function uploadImage(file: File): Promise<string> {
  const res = await authFetch(
    new Request("/api/v1/pois/images", {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    })
  );
  if (!res.ok) throw new Error(await errorMessage(res));
  return ((await res.json()) as { url: string }).url;
}
