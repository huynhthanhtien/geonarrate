import { createApiClient, type TokenOut, type UserOut } from "@geonarrate/api-client";
import { create } from "zustand";

/**
 * Phiên đăng nhập web: access token chỉ giữ trong bộ nhớ, refresh token trong localStorage để
 * tải lại trang không phải đăng nhập lại (đánh đổi: XSS đọc được — giảm thiểu bằng xoay vòng +
 * phát hiện dùng lại ở backend).
 */
const REFRESH_KEY = "geonarrate.refresh_token";

// Client riêng cho /auth/*: không đi qua authFetch để refresh không tự gọi lại chính nó
const authApi = createApiClient();

type Status = "loading" | "anonymous" | "authenticated";

interface SessionState {
  status: Status;
  user: UserOut | null;
  accessToken: string | null;
}

export const useSession = create<SessionState>(() => ({ status: "loading", user: null, accessToken: null }));

export function useCan(): (permission: string) => boolean {
  const permissions = useSession((s) => s.user?.permissions);
  return (permission) => permissions?.includes(permission) ?? false;
}

function apply(t: TokenOut): void {
  localStorage.setItem(REFRESH_KEY, t.refresh_token);
  useSession.setState({ status: "authenticated", user: t.user, accessToken: t.access_token });
}

function clear(): void {
  localStorage.removeItem(REFRESH_KEY);
  useSession.setState({ status: "anonymous", user: null, accessToken: null });
}

/** Lấy `detail` từ lỗi RFC 7807 của backend. */
function problemDetail(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "detail" in error && typeof error.detail === "string") {
    return error.detail;
  }
  return fallback;
}

/** Trả `null` nếu thành công, ngược lại là thông báo lỗi để hiển thị. */
export async function login(email: string, password: string): Promise<string | null> {
  try {
    const { data, error } = await authApi.POST("/api/v1/auth/login", { body: { email, password } });
    if (data) {
      apply(data);
      return null;
    }
    return problemDetail(error, "Đăng nhập thất bại");
  } catch {
    return "Không kết nối được máy chủ";
  }
}

export async function logout(): Promise<void> {
  const token = localStorage.getItem(REFRESH_KEY);
  clear();
  if (token) await authApi.POST("/api/v1/auth/logout", { body: { refresh_token: token } }).catch(() => undefined);
}

let inflight: Promise<boolean> | null = null;

/**
 * Đổi refresh token lấy cặp token mới. Mọi lời gọi đồng thời dùng chung một request — gửi cùng
 * một refresh token hai lần sẽ bị backend coi là dùng lại và thu hồi cả chuỗi.
 */
export function refreshSession(): Promise<boolean> {
  inflight ??= withRefreshLock(doRefresh).finally(() => {
    inflight = null;
  });
  return inflight;
}

// Các tab dùng chung refresh token trong localStorage: khoá để refresh tuần tự,
// tab sau đọc lại token mà tab trước vừa ghi
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  return "locks" in navigator ? navigator.locks.request("geonarrate.refresh", fn) : fn();
}

async function doRefresh(): Promise<boolean> {
  const token = localStorage.getItem(REFRESH_KEY);
  if (!token) {
    clear();
    return false;
  }
  try {
    const { data, response } = await authApi.POST("/api/v1/auth/refresh", { body: { refresh_token: token } });
    if (data) {
      apply(data);
      return true;
    }
    if (response.status === 401) {
      clear();
      return false;
    }
  } catch {
    // lỗi mạng: giữ refresh token để lần sau thử lại
  }
  if (useSession.getState().status === "loading") useSession.setState({ status: "anonymous" });
  return false;
}

function withToken(request: Request): Request {
  const token = useSession.getState().accessToken;
  if (token) request.headers.set("Authorization", `Bearer ${token}`);
  return request;
}

/** `fetch` cho api-client: gắn access token, gặp 401 thì refresh một lần rồi gửi lại. */
export async function authFetch(request: Request): Promise<Response> {
  const retry = request.clone();
  const response = await fetch(withToken(request));
  if (response.status !== 401 || !useSession.getState().accessToken) return response;
  return (await refreshSession()) ? fetch(withToken(retry)) : response;
}
