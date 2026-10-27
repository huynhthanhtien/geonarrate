import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <section>
      <h1>404 — Không tìm thấy trang</h1>
      <Link to="/">Về trang tổng quan</Link>
    </section>
  );
}
