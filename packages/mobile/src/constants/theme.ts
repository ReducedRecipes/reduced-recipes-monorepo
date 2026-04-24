export const fonts = {
  serif: "InstrumentSerif_400Regular",
  serifItalic: "InstrumentSerif_400Regular_Italic",
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemiBold: "Inter_600SemiBold",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",

  // Aliases for backward compat during migration
  display: "InstrumentSerif_400Regular",
  body: "Inter_400Regular",
  bodyMed: "Inter_500Medium",
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
  bg: "#F3F0EB",
  bg2: "#EDE9E3",
  bgCard: "#FFFFFF",
  bgMuted: "#EDE9E3",
  ink: "#2D2923",
  ink2: "#5C5549",
  inkMuted: "#5C5549",
  inkFaint: "#8A8379",
  rule: "#D4CFC8",
  rule2: "#BFB9B0",
  accent: "#C45A30",
  accentInk: "#5C2415",
  accentLight: "#F5E6DD",

  // Aliases
  orange: "#C45A30",
  orangeLight: "#F5E6DD",

  success: "#16A34A",
  warning: "#D97706",
  error: "#DC2626",

  dark: {
    bg: "#141412",
    bg2: "#1C1C1A",
    bgCard: "#1C1C1A",
    bgMuted: "#242422",
    ink: "#F5F4F0",
    ink2: "#B8B3AB",
    inkMuted: "#B8B3AB",
    inkFaint: "#6B7280",
    rule: "#3A3835",
    rule2: "#4A4845",
    accent: "#E07B52",
    accentInk: "#F5C4A8",
    accentLight: "#3D2A20",
    orange: "#E07B52",
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
  none: 0,
  sm: 2,
  md: 4,
  lg: 8,
  xl: 12,
  full: 9999,
} as const;

export const shadow = {
  sm: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  md: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
} as const;
