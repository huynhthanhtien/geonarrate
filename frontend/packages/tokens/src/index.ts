/** Design tokens — nguồn duy nhất cho web & mobile. */
export const color = {
  primary: "#0F766E",
  primaryDark: "#0B5D56",
  primarySoft: "#E6F4F1",
  primaryFg: "#FFFFFF",
  accent: "#C2703D",
  accentSoft: "#FDF1E9",
  canvas: "#FAF9F6",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F4F5",
  border: "#E7E5E4",
  text: "#18181B",
  textMuted: "#71717A",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  success: "#15803D",
  successSoft: "#DCFCE7",
  warning: "#B45309",
  warningSoft: "#FEF3C7",
  info: "#0369A1",
  infoSoft: "#E0F2FE",
  white: "#FFFFFF",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, xl: 24, pill: 999 } as const;
export const font = { caption: 13, body: 15, heading: 17, title: 20, display: 28, hero: 32 } as const;
