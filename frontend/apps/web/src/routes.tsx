/** Route CMS và quyền yêu cầu (chương 06 "Route & phân quyền web") — dùng cho cả router lẫn menu. */
export interface NavItem {
  path: string;
  label: string;
  permission?: string;
}

export const NAV: NavItem[] = [
  { path: "/", label: "Tổng quan" },
  { path: "/attractions", label: "Điểm tham quan", permission: "attraction:read" },
  { path: "/translations", label: "Bản dịch", permission: "translation:review" },
  { path: "/studio/voice", label: "Voice Studio", permission: "audio:build" },
  { path: "/packs", label: "Pack", permission: "pack:publish" },
  { path: "/analytics", label: "Analytics", permission: "analytics:view" },
  { path: "/admin", label: "Quản trị", permission: "admin:manage" },
];
