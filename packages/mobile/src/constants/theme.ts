export const fonts = {
  display: "Lora_600SemiBold",
  body: "DMSans_400Regular",
  bodyMed: "DMSans_500Medium",
  mono: "JetBrainsMono_400Regular",
} as const;

export const fontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
} as const;

export const colors = {
  bg: "#FAFAF8",
  bgCard: "#FFFFFF",
  bgMuted: "#F5F5F0",
  ink: "#1A1A18",
  inkMuted: "#6B6B6B",
  inkFaint: "#A3A3A3",
  orange: "#E85D26",
  orangeLight: "#FFF0EB",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  dark: {
    bg: "#1A1A18",
    bgCard: "#2A2A28",
    bgMuted: "#333330",
    ink: "#FAFAF8",
    inkMuted: "#A3A3A3",
    inkFaint: "#6B6B6B",
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
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const shadow = {
  sm: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
} as const;
