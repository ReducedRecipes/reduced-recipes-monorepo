export const fonts = {
  display: "Lora_600SemiBold",
  body: "DMSans_400Regular",
  bodyMed: "DMSans_500Medium",
  mono: "DMSans_400Regular",
} as const;

export const fontSizes = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
} as const;

export const colors = {
  bg: "#FAFAF8",
  bgCard: "#FFFFFF",
  bgMuted: "#F3F2EF",
  ink: "#1A1A18",
  inkMuted: "#6B7280",
  inkFaint: "#9CA3AF",
  orange: "#E85D26",
  orangeLight: "#FEF0E7",
  success: "#16A34A",
  warning: "#D97706",
  error: "#DC2626",
  dark: {
    bg: "#141412",
    bgCard: "#1C1C1A",
    bgMuted: "#242422",
    ink: "#F5F4F0",
    inkMuted: "#9CA3AF",
    inkFaint: "#6B7280",
    orange: "#FF7A45",
    orangeLight: "#3D2A20",
    success: "#4ADE80",
    warning: "#FBBF24",
    error: "#F87171",
  },
} as const;

export const spacing = {
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  11: 44,
  12: 48,
  14: 56,
  16: 64,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const shadow = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;
