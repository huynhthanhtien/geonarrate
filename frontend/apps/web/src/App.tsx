import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "@geonarrate/api-client";
import { color, space } from "@geonarrate/tokens";

const api = createApiClient();

export function App() {
  const health = useQuery({ queryKey: ["healthz"], queryFn: () => api.GET("/healthz").then((r) => r.data) });
  const langs = useQuery({ queryKey: ["languages"], queryFn: () => api.GET("/api/v1/languages").then((r) => r.data) });

  return (
    <main style={{ fontFamily: "system-ui", padding: space.xl, color: color.text }}>
      <h1 style={{ color: color.primary }}>🎧 GeoNarrate — CMS</h1>
      <p>Backend: {health.isSuccess ? "✅ ok" : health.isError ? "❌ không kết nối được" : "…"}</p>
      <h2>Ngôn ngữ</h2>
      <ul>
        {langs.data?.map((l) => (
          <li key={l.code}>
            <b>{l.code}</b> — {l.native_name} ({l.bcp47}){l.is_source && " · nguồn"}
          </li>
        ))}
      </ul>
    </main>
  );
}
