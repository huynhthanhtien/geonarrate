import { color, radius, space } from "@geonarrate/tokens";

/**
 * Lớp theme của app khách. Giá trị màu lấy từ @geonarrate/tokens để web và
 * mobile không lệch nhau; phần bổ sung ở đây chỉ là thứ React Native cần
 * (font family, thang chữ, đổ bóng, gradient bìa).
 */
export const colors = {
  ...color,
  overlay: "rgba(28, 25, 23, 0.45)",
  scrim: "rgba(28, 25, 23, 0.55)",
  tabInactive: "#A8A29E",
} as const;

export const fonts = {
  regular: "BeVietnamPro_400Regular",
  medium: "BeVietnamPro_500Medium",
  semibold: "BeVietnamPro_600SemiBold",
  bold: "BeVietnamPro_700Bold",
} as const;

export const type = {
  hero: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38 },
  display: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34 },
  title: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28 },
  section: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
} as const;

export const shadow = {
  card: {
    shadowColor: "#1C1917",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  float: {
    shadowColor: "#1C1917",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

export const layout = {
  gutter: 20,
  tabBarHeight: 62,
  miniPlayerHeight: 64,
  buttonHeight: 52,
  touch: 48,
} as const;

export { radius, space };

/** Bảng màu bìa sinh tự động (khi pack chưa có ảnh). */
export const covers = [
  ["#0F766E", "#0B4F4A"],
  ["#C2703D", "#8D4A25"],
  ["#3F5E7A", "#263C51"],
  ["#6B7F4B", "#44532C"],
  ["#8A5A7A", "#5C3852"],
  ["#A8873F", "#6F571F"],
] as const;

export function coverFor(seed: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return covers[hash % covers.length] ?? covers[0]!;
}
