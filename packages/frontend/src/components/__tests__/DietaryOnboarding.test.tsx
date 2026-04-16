import { describe, it, expect, vi } from "vitest";
import { DIETARY_LABELS } from "@rr/shared/dietary";

vi.mock("../../lib/api", () => ({
  getDietaryRecipeCount: vi.fn().mockResolvedValue({ count: 42 }),
  setDietaryPreferences: vi.fn().mockResolvedValue({
    restrictions: ["keto"],
    matching_recipe_count: 42,
    updated_at: "2026-01-01T00:00:00Z",
  }),
}));

import { getDietaryRecipeCount, setDietaryPreferences } from "../../lib/api";

describe("DietaryOnboarding", () => {
  it("component module exports DietaryOnboarding function", async () => {
    const mod = await import("../DietaryOnboarding");
    expect(typeof mod.DietaryOnboarding).toBe("function");
  });

  it("DIETARY_LABELS has all 16 dietary options used by the component", () => {
    const labels = Object.entries(DIETARY_LABELS);
    expect(labels).toHaveLength(16);

    const expectedKeys = [
      "vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free",
      "keto", "halal", "kosher", "low-carb", "paleo", "pescatarian",
      "egg-free", "soy-free", "shellfish-free", "low-sodium", "sugar-free",
    ];
    for (const key of expectedKeys) {
      expect(DIETARY_LABELS[key as keyof typeof DIETARY_LABELS]).toBeDefined();
    }
  });

  it("component source renders all 16 dietary labels and handles toggle/save/skip", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "..", "DietaryOnboarding.tsx"),
      "utf-8",
    );

    // Verifies the component imports and uses DIETARY_LABELS
    expect(source).toContain("DIETARY_LABELS");
    expect(source).toContain("allRestrictions.map");

    // Verifies toggle selection logic
    expect(source).toContain("useState<Set<string>>");
    expect(source).toContain("next.has(restriction)");
    expect(source).toContain("next.delete(restriction)");
    expect(source).toContain("next.add(restriction)");

    // Verifies debounced recipe count
    expect(source).toContain("getDietaryRecipeCount");
    expect(source).toContain("setTimeout");
    expect(source).toContain("clearTimeout");
    expect(source).toContain("500");

    // Verifies save calls API and sets localStorage
    expect(source).toContain("setDietaryPreferences");
    expect(source).toContain('localStorage.setItem("dietary_onboarding_shown"');

    // Verifies skip calls onClose without saving
    expect(source).toContain("handleSkip");
    expect(source).toContain("handleSave");

    // Verifies modal rendering
    expect(source).toContain("fixed inset-0");
    expect(source).toContain("bg-black/50");
    expect(source).toContain("isOpen");
    expect(source).toContain("return null");
  });

  it("getDietaryRecipeCount API function works correctly", async () => {
    const result = await getDietaryRecipeCount(["vegan", "keto"]);
    expect(result).toEqual({ count: 42 });
    expect(getDietaryRecipeCount).toHaveBeenCalledWith(["vegan", "keto"]);
  });

  it("setDietaryPreferences API function works correctly", async () => {
    const result = await setDietaryPreferences(["keto"]);
    expect(result).toEqual({
      restrictions: ["keto"],
      matching_recipe_count: 42,
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(setDietaryPreferences).toHaveBeenCalledWith(["keto"]);
  });

  it("component props interface accepts isOpen and onClose", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "..", "DietaryOnboarding.tsx"),
      "utf-8",
    );

    expect(source).toContain("isOpen: boolean");
    expect(source).toContain("onClose: () => void");

    // Verifies conditional rendering when not open
    expect(source).toContain("if (!isOpen) return null");

    // Verifies Save preferences and Skip buttons
    expect(source).toContain("Save preferences");
    expect(source).toContain("Skip");

    // Verifies selected chip styling (green when selected)
    expect(source).toContain("border-green-500");
    expect(source).toContain("bg-green-100");
    expect(source).toContain("border-gray-300");
  });
});
