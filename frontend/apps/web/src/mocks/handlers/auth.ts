import { http, HttpResponse } from "msw";

export const authHandlers = [
  http.post("/api/v1/auth/login", async ({ request }) => {
    const body = await request.json() as any;
    if (body.email === "editor@test.com" && body.password === "password") {
      return HttpResponse.json({
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: "user-01", email: "editor@test.com", full_name: "Editor Mock", role: "editor" },
      });
    }
    return HttpResponse.json({ detail: "Sai email hoặc mật khẩu" }, { status: 401 });
  }),

  http.get("/healthz", () => HttpResponse.json({ status: "ok" })),

  http.get("/api/v1/languages", () =>
    HttpResponse.json([
      { code: "vi", bcp47: "vi-VN", native_name: "Tiếng Việt", is_source: true },
      { code: "en", bcp47: "en-US", native_name: "English", is_source: false },
    ])
  ),
];