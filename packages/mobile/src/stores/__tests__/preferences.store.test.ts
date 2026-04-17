import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("react-native-mmkv", () => {
  const store = new Map<string, string>();
  return {
    MMKV: vi.fn().mockImplementation(() => ({
      getString: (key: string) => store.get(key),
      set: (key: string, value: string) => store.set(key, value),
      delete: (key: string) => store.delete(key),
      contains: (key: string) => store.has(key),
      clearAll: () => store.clear(),
    })),
  };
});

import { usePreferencesStore } from "../preferences.store";

describe("preferences.store", () => {
  beforeEach(() => {
    usePreferencesStore.setState({
      theme: "system",
      textSize: "md",
      defaultServings: 2,
      dietaryFilters: [],
    });
  });

  describe("default values", () => {
    it("has correct initial state", () => {
      const state = usePreferencesStore.getState();
      expect(state.theme).toBe("system");
      expect(state.textSize).toBe("md");
      expect(state.defaultServings).toBe(2);
      expect(state.dietaryFilters).toEqual([]);
    });
  });

  describe("setTheme", () => {
    it("sets theme to light", () => {
      usePreferencesStore.getState().setTheme("light");
      expect(usePreferencesStore.getState().theme).toBe("light");
    });

    it("sets theme to dark", () => {
      usePreferencesStore.getState().setTheme("dark");
      expect(usePreferencesStore.getState().theme).toBe("dark");
    });

    it("sets theme to system", () => {
      usePreferencesStore.getState().setTheme("dark");
      usePreferencesStore.getState().setTheme("system");
      expect(usePreferencesStore.getState().theme).toBe("system");
    });
  });

  describe("setTextSize", () => {
    it("sets text size to sm", () => {
      usePreferencesStore.getState().setTextSize("sm");
      expect(usePreferencesStore.getState().textSize).toBe("sm");
    });

    it("sets text size to lg", () => {
      usePreferencesStore.getState().setTextSize("lg");
      expect(usePreferencesStore.getState().textSize).toBe("lg");
    });

    it("sets text size to xl", () => {
      usePreferencesStore.getState().setTextSize("xl");
      expect(usePreferencesStore.getState().textSize).toBe("xl");
    });
  });

  describe("setDefaultServings", () => {
    it("sets default servings", () => {
      usePreferencesStore.getState().setDefaultServings(4);
      expect(usePreferencesStore.getState().defaultServings).toBe(4);
    });

    it("sets servings to 1", () => {
      usePreferencesStore.getState().setDefaultServings(1);
      expect(usePreferencesStore.getState().defaultServings).toBe(1);
    });
  });

  describe("toggleDietary", () => {
    it("adds a filter when not present", () => {
      usePreferencesStore.getState().toggleDietary("Vegan");
      expect(usePreferencesStore.getState().dietaryFilters).toEqual(["Vegan"]);
    });

    it("removes a filter when already present", () => {
      usePreferencesStore.getState().toggleDietary("Vegan");
      usePreferencesStore.getState().toggleDietary("Vegan");
      expect(usePreferencesStore.getState().dietaryFilters).toEqual([]);
    });

    it("handles multiple filters", () => {
      usePreferencesStore.getState().toggleDietary("Vegan");
      usePreferencesStore.getState().toggleDietary("Gluten-Free");
      usePreferencesStore.getState().toggleDietary("Keto");
      expect(usePreferencesStore.getState().dietaryFilters).toEqual([
        "Vegan",
        "Gluten-Free",
        "Keto",
      ]);
    });

    it("removes only the targeted filter", () => {
      usePreferencesStore.getState().toggleDietary("Vegan");
      usePreferencesStore.getState().toggleDietary("Gluten-Free");
      usePreferencesStore.getState().toggleDietary("Vegan");
      expect(usePreferencesStore.getState().dietaryFilters).toEqual([
        "Gluten-Free",
      ]);
    });
  });
});
