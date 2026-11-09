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
  return (await res.json()) as T;
}

export async function getAudioPreview(attractionId: string, lang: string, signal: AbortSignal): Promise<Blob> {
  const path = `/api/v1/audio/${encodeURIComponent(attractionId)}/${encodeURIComponent(lang)}/preview`;
  const response = await authFetch(new Request(path, { signal }));
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.blob();
}
