/** Nhãn tiếng Việt cho các mã lưu trong CSDL, và định dạng ngày giờ dùng chung cho mọi trang. */

export const CATEGORY_LABELS: Record<string, string> = {
  temple: "Chùa, đền",
  church: "Nhà thờ",
  museum: "Bảo tàng",
  park: "Công viên",
  other: "Khác",
};
export const CATEGORIES = Object.keys(CATEGORY_LABELS);
export const categoryLabel = (code: string) => CATEGORY_LABELS[code] ?? code;

export const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  editor: "Biên tập viên",
  translator: "Biên dịch viên",
};
export const ROLES = Object.keys(ROLE_LABELS);
export const roleLabel = (code: string) => ROLE_LABELS[code] ?? code;

/** 10/11/2026 05:23 — ngày trước, giờ sau, theo múi giờ máy người xem. */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return `${d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })} ${time}`;
}

/** 10/11/2026 */
export function formatDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}
