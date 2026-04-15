import { describe, it, expect, beforeEach, vi } from "vitest";
import { act } from "@testing-library/react";

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
    // Reset store to defaults between tests
    act(() => {
      usePreferencesStore.setState({
        theme: "system",
        textSize: "md",
        defaultServings: 2,
        dietaryFilters: [],
      });
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
      act(() => usePreferencesStore.getState().setTheme("light"));
      expect(usePreferencesStore.getState().theme).toBe("light");
    });

    it("sets theme to dark", () => {
      act(() => usePreferencesStore.getState().setTheme("dark"));
      expect(usePreferencesStore.getState().theme).toBe("dark");
    });

    it("sets theme to system", () => {
      act(() => usePreferencesStore.getState().setTheme("dark"));
      act(() => usePreferencesStore.getState().setTheme("system"));
      expect(usePreferencesStore.getState().theme).toBe("system");
    });
  });

  describe("setTextSize", () => {
    it("sets text size to sm", () => {
      act(() => usePreferencesStore.getState().setTextSize("sm"));
      expect(usePreferencesStore.getState().textSize).toBe("sm");
    });

    it("sets text size to lg", () => {
      act(() => usePreferencesStore.getState().setTextSize("lg"));
      expect(usePreferencesStore.getState().textSize).toBe("lg");
    });

    it("sets text size to xl", () => {
      act(() => usePreferencesStore.getState().setTextSize("xl"));
      expect(usePreferencesStore.getState().textSize).toBe("xl");
    });
  });

  describe("setDefaultServings", () => {
    it("sets default servings", () => {
      act(() => usePreferencesStore.getState().setDefaultServings(4));
      expect(usePreferencesStore.getState().defaultServings).toBe(4);
    });

    it("sets servings to 1", () => {
      act(() => usePreferencesStore.getState().setDefaultServings(1));
      expect(usePreferencesStore.getState().defaultServings).toBe(1);
    });
  });

  describe("toggleDietary", () => {
    it("adds a filter when not present", () => {
      act(() => usePreferencesStore.getState().toggleDietary("Vegan"));
      expect(usePreferencesStore.getState().dietaryFilters).toEqual(["Vegan"]);
    });

    it("removes a filter when already present", () => {
      act(() => usePreferencesStore.getState().toggleDietary("Vegan"));
      act(() => usePreferencesStore.getState().toggleDietary("Vegan"));
      expect(usePreferencesStore.getState().dietaryFilters).toEqual([]);
    });

    it("handles multiple filters", () => {
      act(() => usePreferencesStore.getState().toggleDietary("Vegan"));
      act(() => usePreferencesStore.getState().toggleDietary("Gluten-Free"));
      act(() => usePreferencesStore.getState().toggleDietary("Keto"));
      expect(usePreferencesStore.getState().dietaryFilters).toEqual([
        "Vegan",
        "Gluten-Free",
        "Keto",
      ]);
    });

    it("removes only the targeted filter", () => {
      act(() => usePreferencesStore.getState().toggleDietary("Vegan"));
      act(() => usePreferencesStore.getState().toggleDietary("Gluten-Free"));
      act(() => usePreferencesStore.getState().toggleDietary("Vegan"));
      expect(usePreferencesStore.getState().dietaryFilters).toEqual([
        "Gluten-Free",
      ]);
    });
  });
});
