/** Route CMS và quyền yêu cầu (chương 06 "Route & phân quyền web") — dùng cho cả router lẫn menu. */
export interface NavItem {
  path: string;
  label: string;
  permission?: string;
}

export const NAV: NavItem[] = [
  { path: "/", label: "Tổng quan" },
  { path: "/pois", label: "Điểm tham quan", permission: "poi:read" },
  { path: "/reviews", label: "Duyệt script", permission: "script:approve" },
  { path: "/translations", label: "Bản dịch", permission: "translation:read" },
  { path: "/glossaries", label: "Thuật ngữ", permission: "glossary:read" },
  { path: "/studio/voice", label: "Voice Studio", permission: "audio:read" },
  { path: "/tours", label: "Tour", permission: "tour:read" },
  { path: "/packs", label: "Pack", permission: "pack:read" },
  { path: "/tickets", label: "Vé QR", permission: "ticket:read" },
  { path: "/analytics", label: "Analytics", permission: "analytics:read" },
  { path: "/accounts", label: "Tài khoản", permission: "user:manage" },
  { path: "/admin", label: "Nhật ký", permission: "audit:read" },
];
