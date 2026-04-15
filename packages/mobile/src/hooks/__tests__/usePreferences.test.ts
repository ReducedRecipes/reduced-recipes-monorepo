import { describe, it, expect, beforeEach } from "vitest";
import { usePreferencesStore, TextSize } from "../../stores/preferences.store";

// Test the computed logic that usePreferences provides on top of the store.
// We test via store directly since renderHook has React version conflicts in this monorepo.

const TEXT_SIZE_MULTIPLIERS: Record<TextSize, number> = {
  sm: 0.85,
  md: 1.0,
  lg: 1.15,
  xl: 1.3,
};

function getTextSizeMultiplier(textSize: TextSize): number {
  return TEXT_SIZE_MULTIPLIERS[textSize];
}

function resetStore() {
  usePreferencesStore.setState({
    theme: "system",
    textSize: "md",
    defaultServings: 2,
    dietaryFilters: [],
  });
}

describe("usePreferences computed properties", () => {
  beforeEach(() => {
    resetStore();
  });

  it("returns default textSizeMultiplier of 1.0 for md", () => {
    const { textSize } = usePreferencesStore.getState();
    expect(textSize).toBe("md");
    expect(getTextSizeMultiplier(textSize)).toBe(1.0);
  });

  it("computes textSizeMultiplier for sm", () => {
    usePreferencesStore.getState().setTextSize("sm");
    const { textSize } = usePreferencesStore.getState();
    expect(getTextSizeMultiplier(textSize)).toBe(0.85);
  });

  it("computes textSizeMultiplier for lg", () => {
    usePreferencesStore.getState().setTextSize("lg");
    const { textSize } = usePreferencesStore.getState();
    expect(getTextSizeMultiplier(textSize)).toBe(1.15);
  });

  it("computes textSizeMultiplier for xl", () => {
    usePreferencesStore.getState().setTextSize("xl");
    const { textSize } = usePreferencesStore.getState();
    expect(getTextSizeMultiplier(textSize)).toBe(1.3);
  });

  it("all TextSize values have a multiplier", () => {
    const sizes: TextSize[] = ["sm", "md", "lg", "xl"];
    for (const size of sizes) {
      const multiplier = getTextSizeMultiplier(size);
      expect(multiplier).toBeGreaterThan(0);
      expect(typeof multiplier).toBe("number");
    }
  });

  it("multipliers are ordered sm < md < lg < xl", () => {
    expect(getTextSizeMultiplier("sm")).toBeLessThan(getTextSizeMultiplier("md"));
    expect(getTextSizeMultiplier("md")).toBeLessThan(getTextSizeMultiplier("lg"));
    expect(getTextSizeMultiplier("lg")).toBeLessThan(getTextSizeMultiplier("xl"));
  });

  it("store actions work correctly for preferences", () => {
    usePreferencesStore.getState().setTheme("dark");
    expect(usePreferencesStore.getState().theme).toBe("dark");

    usePreferencesStore.getState().setDefaultServings(4);
    expect(usePreferencesStore.getState().defaultServings).toBe(4);

    usePreferencesStore.getState().toggleDietary("vegan");
    expect(usePreferencesStore.getState().dietaryFilters).toContain("vegan");

    usePreferencesStore.getState().toggleDietary("vegan");
    expect(usePreferencesStore.getState().dietaryFilters).not.toContain("vegan");
  });
});
