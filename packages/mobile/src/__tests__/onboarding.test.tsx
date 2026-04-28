import { describe, it, expect, vi, beforeAll } from "vitest";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";

// Set React Native globals before any imports
(globalThis as any).__DEV__ = true;

// Mock all external dependencies
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: any) => ({ type: "View", children })),
  Text: vi.fn(({ children }: any) => ({ type: "Text", children })),
  Pressable: vi.fn(({ children }: any) => ({ type: "Pressable", children })),
  FlatList: vi.fn(() => ({ type: "FlatList" })),
  ActivityIndicator: vi.fn(() => ({ type: "ActivityIndicator" })),
  useWindowDimensions: () => ({ width: 375, height: 812 }),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/lib/mmkv", () => ({
  mmkv: { set: vi.fn(), getString: vi.fn() },
}));

vi.mock("@/stores/preferences.store", () => ({
  usePreferencesStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        toggleDietary: vi.fn(),
        dietaryFilters: [],
      }),
    { getState: () => ({ dietaryFilters: [] }) },
  ),
}));

vi.mock("@/stores/auth.store", () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      sessionToken: null,
      isAuthenticated: false,
    }),
}));

vi.mock("@rr/shared/dietary", () => ({
  DIETARY_LABELS: {
    vegan: "Vegan",
    vegetarian: "Vegetarian",
    "gluten-free": "Gluten-free",
    "dairy-free": "Dairy-free",
    keto: "Keto",
    paleo: "Paleo",
    "nut-free": "Nut-free",
    "soy-free": "Soy-free",
    "egg-free": "Egg-free",
    "fish-free": "Fish-free",
    "shellfish-free": "Shellfish-free",
    "low-sodium": "Low-sodium",
    "low-sugar": "Low-sugar",
    "high-protein": "High-protein",
    "low-carb": "Low-carb",
    "whole30": "Whole30",
  },
}));

vi.mock("@/constants/theme", () => ({
  colors: {
    bg: "#FAFAF8",
    orange: "#E85D26",
    orangeLight: "#FEF0E7",
    ink: "#1A1A18",
    inkMuted: "#6B7280",
    inkFaint: "#9CA3AF",
    bgMuted: "#F3F2EF",
  },
  fonts: {
    display: "Lora_600SemiBold",
    body: "DMSans_400Regular",
    bodyMed: "DMSans_500Medium",
  },
}));

const ONBOARDING_FILE = resolve(__dirname, "../../app/onboarding/index.tsx");

describe("Onboarding Screen (S-25)", () => {
  it("file exists at packages/mobile/app/onboarding/index.tsx", () => {
    expect(existsSync(ONBOARDING_FILE)).toBe(true);
  });

  it("exports a default component", async () => {
    const mod = await import("../../app/onboarding/index");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("contains three slides for welcome, dietary, and notifications", () => {
    const source = readFileSync(ONBOARDING_FILE, "utf-8");
    expect(source).toContain("welcome");
    expect(source).toContain("dietary");
    expect(source).toContain("notifications");
  });

  it("renders brand text on welcome slide", () => {
    const source = readFileSync(ONBOARDING_FILE, "utf-8");
    expect(source).toContain("Recipes without");
    expect(source).toContain("the story.");
    expect(source).toContain("Just the good stuff.");
  });

  it("includes dietary preference options via DIETARY_LABELS", () => {
    const source = readFileSync(ONBOARDING_FILE, "utf-8");
    expect(source).toContain("Any dietary preferences?");
    // S-5 replaced hardcoded options with shared DIETARY_LABELS
    expect(source).toContain("DIETARY_LABELS");
    expect(source).toContain("ALL_DIETARY_OPTIONS");
    expect(source).toContain("@rr/shared/dietary");
  });

  it("sets ONBOARDING_COMPLETE in MMKV on completion", () => {
    const source = readFileSync(ONBOARDING_FILE, "utf-8");
    expect(source).toContain('mmkv.set("ONBOARDING_COMPLETE"');
    expect(source).toContain('"true"');
  });

  it("navigates to tabs on completion", () => {
    const source = readFileSync(ONBOARDING_FILE, "utf-8");
    expect(source).toContain('router.replace("/(tabs)/"');
  });

  it("uses usePreferencesStore for dietary toggles", () => {
    const source = readFileSync(ONBOARDING_FILE, "utf-8");
    expect(source).toContain("usePreferencesStore");
    expect(source).toContain("toggleDietary");
  });

  it("has notifications slide with enable button", () => {
    const source = readFileSync(ONBOARDING_FILE, "utf-8");
    expect(source).toContain("Stay updated");
    expect(source).toContain("ENABLE NOTIFICATIONS");
  });

  it("uses horizontal paging for slide navigation", () => {
    const source = readFileSync(ONBOARDING_FILE, "utf-8");
    expect(source).toContain("pagingEnabled");
    expect(source).toContain("horizontal");
  });

  it("uses brand fonts from theme", () => {
    const source = readFileSync(ONBOARDING_FILE, "utf-8");
    expect(source).toContain("fonts.serif");
    expect(source).toContain("fonts.sans");
    expect(source).toContain("fonts.mono");
  });
});
