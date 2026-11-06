import { useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleX } from "lucide-react";
import { api } from "../api";

export function HomePage() {
  const health = useQuery({ queryKey: ["healthz"], queryFn: () => api.GET("/healthz").then((r) => r.data) });
  const langs = useQuery({ queryKey: ["languages"], queryFn: () => api.GET("/api/v1/languages").then((r) => r.data) });

  return (
    <section>
      <h1>Tổng quan</h1>
      <p style={{ display: "flex", alignItems: "center", gap: 6 }}>Backend: {health.isSuccess ? <><CircleCheck size={16} color="#0f766e" aria-hidden /> ok</> : health.isError ? <><CircleX size={16} color="#dc2626" aria-hidden /> không kết nối được</> : "…"}</p>
      <h2>Ngôn ngữ</h2>
      <ul>
        {langs.data?.map((l) => (
          <li key={l.code}>
            <b>{l.code}</b> — {l.native_name} ({l.bcp47}){l.is_source && " · nguồn"}
          </li>
        ))}
      </ul>
    </section>
  );
}
