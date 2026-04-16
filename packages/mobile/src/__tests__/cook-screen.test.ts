import { describe, it, expect, vi } from "vitest";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";

// Mock external dependencies
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "recipe-1" }),
  router: { back: vi.fn(), push: vi.fn() },
  Stack: { Screen: vi.fn(() => null) },
}));

vi.mock("react-native", () => ({
  View: vi.fn(({ children }: any) => ({ type: "View", children })),
  Text: vi.fn(({ children }: any) => ({ type: "Text", children })),
  Pressable: vi.fn(({ children }: any) => ({ type: "Pressable", children })),
  Alert: { alert: vi.fn() },
  ActivityIndicator: vi.fn(() => ({ type: "ActivityIndicator" })),
  BackHandler: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

vi.mock("@/hooks/useRecipe", () => ({
  useRecipe: vi.fn(() => ({
    data: {
      id: "recipe-1",
      title: "Test Recipe",
      instructions: ["Chop onions", "Cook for 5 minutes", "Serve"],
      ingredients: ["2 onions", "1 tbsp olive oil"],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock("@/hooks/useCookingSession", () => ({
  useCookingSession: vi.fn(() => ({
    currentStep: 1,
    totalSteps: 3,
    nextStep: vi.fn(),
    prevStep: vi.fn(),
    startTimer: vi.fn(),
    pauseTimer: vi.fn(),
    timerRemaining: 0,
    timerRunning: false,
    endSession: vi.fn(),
  })),
}));

vi.mock("@/hooks/useVoiceGuidance", () => ({
  useVoiceGuidance: vi.fn(() => ({
    speakStep: vi.fn(async () => {}),
    stopSpeaking: vi.fn(),
    isSpeaking: false,
  })),
}));

vi.mock("@/components/CookingStep", () => ({
  CookingStep: vi.fn(() => null),
}));

vi.mock("@/components/ErrorState", () => ({
  ErrorState: vi.fn(() => null),
}));

describe("CookingModeScreen (app/cook/[id].tsx)", () => {
  const screenPath = resolve(
    __dirname,
    "../../app/cook/[id].tsx",
  );

  it("file exists", () => {
    expect(existsSync(screenPath)).toBe(true);
  });

  it("exports a default component", () => {
    const source = readFileSync(screenPath, "utf-8");
    expect(source).toContain("export default function");
  });

  it("source contains required dependencies", () => {
    const source = readFileSync(screenPath, "utf-8");
    expect(source).toContain("useLocalSearchParams");
    expect(source).toContain("useRecipe");
    expect(source).toContain("useCookingSession");
    expect(source).toContain("useVoiceGuidance");
    expect(source).toContain("CookingStep");
    expect(source).toContain("BackHandler");
  });

  it("source includes exit confirmation dialog", () => {
    const source = readFileSync(screenPath, "utf-8");
    expect(source).toContain("Exit Cooking Mode");
    expect(source).toContain("Alert.alert");
  });

  it("source uses fullScreenModal presentation", () => {
    const source = readFileSync(screenPath, "utf-8");
    expect(source).toContain("fullScreenModal");
  });

  it("source includes voice guidance on long press", () => {
    const source = readFileSync(screenPath, "utf-8");
    expect(source).toContain("onLongPress");
    expect(source).toContain("speakStep");
  });

  it("source includes accessibility attributes", () => {
    const source = readFileSync(screenPath, "utf-8");
    expect(source).toContain("accessibilityLabel");
    expect(source).toContain("accessibilityHint");
  });

  it("source handles loading and error states", () => {
    const source = readFileSync(screenPath, "utf-8");
    expect(source).toContain("isLoading");
    expect(source).toContain("ActivityIndicator");
    expect(source).toContain("ErrorState");
  });

  it("source includes timer parsing logic", () => {
    const source = readFileSync(screenPath, "utf-8");
    expect(source).toContain("parseTimerSeconds");
    expect(source).toContain("minute");
  });

  it("source includes ingredient matching", () => {
    const source = readFileSync(screenPath, "utf-8");
    expect(source).toContain("matchIngredients");
    expect(source).toContain("stepIngredients");
  });
});
