import { http, HttpResponse } from "msw";

const EDITOR_PERMISSIONS = ["poi:read", "script:write"];
// Khớp ROLE_PERMISSIONS trong backend/app/core/permissions.py
const USERS = {
  editor: { id: "user-01", email: "editor@test.com", full_name: "Editor Mock", role: "editor", permissions: EDITOR_PERMISSIONS },
  admin: {
    id: "user-02",
    email: "admin@test.com",
    full_name: "Admin Mock",
    role: "admin",
    permissions: [...EDITOR_PERMISSIONS, "translation:review", "audio:build", "pack:publish", "analytics:view", "admin:manage"],
  },
} as const;

const REFRESH_PREFIX = "mock-refresh-";

function tokens(role: keyof typeof USERS) {
  return HttpResponse.json({
    access_token: "mock-access-token",
    refresh_token: `${REFRESH_PREFIX}${role}`,
    token_type: "bearer",
    expires_in: 3600,
    user: USERS[role],
  });
}

export const authHandlers = [
  http.post("/api/v1/auth/login", async ({ request }) => {
    const body = await request.json() as any;
    const role = (Object.keys(USERS) as (keyof typeof USERS)[]).find((r) => USERS[r].email === body.email);
    if (role && body.password === "password") return tokens(role);
    return HttpResponse.json({ detail: "Sai email hoặc mật khẩu" }, { status: 401 });
  }),

  http.post("/api/v1/auth/refresh", async ({ request }) => {
    const body = await request.json() as any;
    const role = String(body.refresh_token).slice(REFRESH_PREFIX.length);
    if (role in USERS) return tokens(role as keyof typeof USERS);
    return HttpResponse.json({ detail: "Refresh token không hợp lệ" }, { status: 401 });
  }),

  http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })),
  http.post("/api/v1/auth/logout-all", () => new HttpResponse(null, { status: 204 })),

  http.get("/healthz", () => HttpResponse.json({ status: "ok" })),

  http.get("/api/v1/languages", () =>
    HttpResponse.json([
      { code: "vi", bcp47: "vi-VN", native_name: "Tiếng Việt", is_source: true },
      { code: "en", bcp47: "en-US", native_name: "English", is_source: false },
      { code: "zh", bcp47: "zh-CN", native_name: "中文", is_source: false },
      { code: "ja", bcp47: "ja-JP", native_name: "日本語", is_source: false },
      { code: "ko", bcp47: "ko-KR", native_name: "한국어", is_source: false },
    ])
  ),
];
