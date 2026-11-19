/** BookIt visual tokens. Web maps these to CSS variables. Mobile reads them directly. */

export const brand = {
  primary: "#7C3AED",
  primaryDark: "#6D28D9",
  lavender: "#A78BFA",
  ink: "#141420",
  light: "#F8F7FC",
  white: "#FFFFFF",
} as const;

export const darkTheme = {
  bg: "#141420",
  bgElevated: "#1B1B2C",
  sidebar: "#10101A",
  card: "#1C1C2E",
  cardHover: "#242438",
  text: "#F5F3FB",
  muted: "#A7A2C2",
  line: "#2E2C44",
  primary: brand.primary,
  lavender: brand.lavender,
  success: "#34D399",
  warning: "#FBBF24",
  danger: "#FB7185",
  info: "#60A5FA",
} as const;

export const lightTheme = {
  bg: "#F8F7FC",
  bgElevated: "#FFFFFF",
  sidebar: "#FFFFFF",
  card: "#FFFFFF",
  cardHover: "#F3F0FA",
  text: "#16141F",
  muted: "#615C78",
  line: "#E7E3F2",
  primary: brand.primary,
  lavender: brand.lavender,
  success: "#059669",
  warning: "#D97706",
  danger: "#E11D48",
  info: "#2563EB",
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const font = {
  family: "Inter, Geist, ui-sans-serif, system-ui, sans-serif",
} as const;

export const shadow = {
  card: "0 12px 40px rgba(18, 12, 40, 0.08)",
  cardDark: "0 16px 40px rgba(0, 0, 0, 0.35)",
} as const;

export type ThemeName = "dark" | "light";
export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";
