import { describe, it, expect, vi } from "vitest";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";

// Mock all external dependencies
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: any) => ({ type: "View", children })),
  Text: vi.fn(({ children }: any) => ({ type: "Text", children })),
  Pressable: vi.fn(({ children }: any) => ({ type: "Pressable", children })),
  FlatList: vi.fn(() => ({ type: "FlatList" })),
  useWindowDimensions: () => ({ width: 375, height: 812 }),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/lib/mmkv", () => ({
  mmkv: { set: vi.fn(), getString: vi.fn() },
}));

vi.mock("@/stores/preferences.store", () => ({
  usePreferencesStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      toggleDietary: vi.fn(),
      dietaryFilters: [],
    }),
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
    expect(source).toContain("Recipes without the story.");
    expect(source).toContain("Just the good stuff.");
  });

  it("includes dietary preference options", () => {
    const source = readFileSync(ONBOARDING_FILE, "utf-8");
    expect(source).toContain("Any dietary preferences?");
    for (const option of ["None", "Vegan", "Vegetarian", "Gluten-free", "Dairy-free", "Keto"]) {
      expect(source).toContain(option);
    }
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
    expect(source).toContain("Enable Notifications");
  });

  it("uses horizontal paging for slide navigation", () => {
    const source = readFileSync(ONBOARDING_FILE, "utf-8");
    expect(source).toContain("pagingEnabled");
    expect(source).toContain("horizontal");
  });

  it("uses brand fonts from theme", () => {
    const source = readFileSync(ONBOARDING_FILE, "utf-8");
    expect(source).toContain("fonts.display");
    expect(source).toContain("fonts.body");
  });
});
