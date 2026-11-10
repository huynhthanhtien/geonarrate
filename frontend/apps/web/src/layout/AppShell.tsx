import { color, font, space } from "@geonarrate/tokens";
import { Headphones } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { api } from "../api";
import { logout, useCan, useSession } from "../auth/session";
import { NAV } from "../routes";

export function AppShell() {
  const user = useSession((s) => s.user);
  const can = useCan();
  const { pathname } = useLocation();
  const content = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    content.current?.scrollTo(0, 0);
  }, [pathname]);

  async function logoutAll() {
    if (!confirm("Đăng xuất khỏi mọi thiết bị?")) return;
    const { response } = await api.POST("/api/v1/auth/logout-all").catch(() => ({ response: null }));
    // Chưa thu hồi được thì giữ phiên và báo lỗi, tránh tưởng các thiết bị khác đã bị đăng xuất
    if (!response?.ok) {
      alert("Không đăng xuất được các thiết bị khác, thử lại sau");
      return;
    }
    await logout();
  }

  return (
    <div
      className="grid h-dvh grid-cols-[clamp(8.5rem,22vw,13.75rem)_minmax(0,1fr)] overflow-hidden"
      style={{ fontFamily: "system-ui", color: color.text }}
    >
      <nav
        aria-label="Điều hướng chính"
        className="col-start-1 row-start-1 min-h-0 overflow-y-auto p-3 sm:p-4"
        style={{ background: color.surfaceMuted }}
      >
        <div style={{ fontSize: font.title, fontWeight: 700, color: color.primary, marginBottom: space.xl, display: "flex", alignItems: "center", gap: 8 }}>
          <Headphones size={20} aria-hidden /> GeoNarrate
        </div>
        {NAV.filter((item) => !item.permission || can(item.permission)).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            style={({ isActive }) => ({
              display: "block",
              padding: `${space.sm}px ${space.md}px`,
              borderRadius: 6,
              textDecoration: "none",
              color: isActive ? color.primaryFg : color.text,
              background: isActive ? color.primary : "transparent",
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="col-start-2 row-start-1 flex min-h-0 min-w-0 flex-col">
        <header
          className="flex shrink-0 flex-wrap items-center justify-end"
          style={{
            gap: space.md,
            padding: `${space.md}px ${space.xl}px`,
            borderBottom: `1px solid ${color.surfaceMuted}`,
          }}
        >
          <span>
            {user?.full_name || user?.email} <span style={{ color: color.textMuted }}>· {user?.role}</span>
          </span>
          <button onClick={() => void logout()}>Đăng xuất</button>
          <button onClick={() => void logoutAll()}>Đăng xuất mọi nơi</button>
        </header>
        <main ref={content} className="min-h-0 flex-1 overflow-auto overscroll-contain" style={{ padding: space.xl }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
