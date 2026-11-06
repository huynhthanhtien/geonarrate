import { color, radius, space } from "@geonarrate/tokens";
import { Headphones } from "lucide-react";
import { type FormEvent, useState } from "react";
import { type Location, Navigate, useLocation } from "react-router";
import { login, useSession } from "../auth/session";

export function LoginPage() {
  const status = useSession((s) => s.status);
  const from = (useLocation().state as { from?: Location } | null)?.from;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status === "authenticated") return <Navigate to={from ?? "/"} replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(await login(String(form.get("email")), String(form.get("password"))));
    setPending(false);
  }

  const input = { padding: space.sm, borderRadius: radius.sm, border: `1px solid ${color.textMuted}` };
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", fontFamily: "system-ui" }}>
      <form
        onSubmit={(e) => void onSubmit(e)}
        style={{ display: "flex", flexDirection: "column", gap: space.md, width: 320 }}
      >
        <h1 style={{ color: color.primary, margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Headphones size={24} aria-hidden /> GeoNarrate CMS</h1>
        <input name="email" type="email" placeholder="Email" autoComplete="username" required style={input} />
        <input
          name="password"
          type="password"
          placeholder="Mật khẩu"
          autoComplete="current-password"
          required
          style={input}
        />
        {error && <p style={{ color: color.danger, margin: 0 }}>{error}</p>}
        <button
          type="submit"
          disabled={pending}
          style={{ padding: space.sm, background: color.primary, color: color.primaryFg, border: 0, borderRadius: radius.sm }}
        >
          {pending ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </main>
  );
}
