import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { ForbiddenPage } from "../pages/ForbiddenPage";
import { useCan, useSession } from "./session";

/** Chưa đăng nhập thì chuyển sang /login, đăng nhập xong quay lại trang đang mở. */
export function RequireAuth() {
  const status = useSession((s) => s.status);
  const location = useLocation();
  if (status === "loading") return <p style={{ padding: 24 }}>Đang tải…</p>;
  if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Thiếu quyền thì hiện trang "Không có quyền" (API cũng trả 403 — đây chỉ là lớp UX). */
export function RequirePermission({ permission, children }: { permission?: string; children: ReactNode }) {
  const can = useCan();
  return permission && !can(permission) ? <ForbiddenPage /> : children;
}
