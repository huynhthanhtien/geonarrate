import { color } from "@geonarrate/tokens";
import { Link } from "react-router";

export function ForbiddenPage() {
  return (
    <section>
      <h1 style={{ color: color.danger }}>403 — Không có quyền</h1>
      <p>Vai trò của bạn không được truy cập trang này.</p>
      <Link to="/">Về trang tổng quan</Link>
    </section>
  );
}
