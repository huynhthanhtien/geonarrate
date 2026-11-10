/** Route CMS và quyền yêu cầu (chương 06 "Route & phân quyền web") — dùng cho cả router lẫn menu. */
export interface NavItem {
  path: string;
  label: string;
  permission?: string;
}

export const NAV: NavItem[] = [
  { path: "/", label: "Tổng quan" },
  { path: "/pois", label: "Điểm tham quan", permission: "poi:read" },
  // Chưa có quyền riêng cho duyệt script; theo use case người duyệt là admin
  { path: "/reviews", label: "Duyệt script", permission: "admin:manage" },
  { path: "/translations", label: "Bản dịch", permission: "translation:review" },
  { path: "/glossaries", label: "Thuật ngữ", permission: "translation:review" },
  { path: "/studio/voice", label: "Voice Studio", permission: "audio:build" },
  { path: "/tours", label: "Tour", permission: "admin:manage" },
  { path: "/packs", label: "Pack", permission: "pack:publish" },
  { path: "/tickets", label: "Vé QR", permission: "admin:manage" },
  { path: "/analytics", label: "Analytics", permission: "analytics:view" },
  { path: "/accounts", label: "Tài khoản", permission: "admin:manage" },
  { path: "/admin", label: "Nhật ký", permission: "admin:manage" },
];
