/** Design tokens — nguồn duy nhất cho web & mobile. */
export const color = {
  primary: "#0F766E",
  primaryFg: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F4F5",
  text: "#18181B",
  textMuted: "#71717A",
  danger: "#DC2626",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16 } as const;
export const font = { body: 15, title: 20, heading: 28 } as const;
