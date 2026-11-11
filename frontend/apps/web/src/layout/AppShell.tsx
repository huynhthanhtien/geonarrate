import { color, font, space } from "@geonarrate/tokens";
import { Headphones } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useCan } from "../auth/session";
import { UserMenu } from "../components/UserMenu";
import { NAV } from "../routes";

export function AppShell() {
  const can = useCan();
  const { pathname } = useLocation();
  const content = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    content.current?.scrollTo(0, 0);
  }, [pathname]);

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
          <UserMenu />
        </header>
        <main ref={content} className="min-h-0 flex-1 overflow-auto overscroll-contain" style={{ padding: space.xl }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
