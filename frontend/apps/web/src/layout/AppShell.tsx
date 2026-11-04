import { color, font, space } from "@geonarrate/tokens";
import { NavLink, Outlet } from "react-router";
import { api } from "../api";
import { logout, useCan, useSession } from "../auth/session";
import { NAV } from "../routes";

export function AppShell() {
  const user = useSession((s) => s.user);
  const can = useCan();

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
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui", color: color.text }}>
      <nav style={{ width: 220, background: color.surfaceMuted, padding: space.lg }}>
        <div style={{ fontSize: font.title, fontWeight: 700, color: color.primary, marginBottom: space.xl }}>
          🎧 GeoNarrate
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
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
        <main style={{ padding: space.xl }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
