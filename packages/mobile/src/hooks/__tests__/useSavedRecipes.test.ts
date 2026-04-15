import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/queries", () => ({
  upsertRecipe: vi.fn().mockResolvedValue(undefined),
  deleteRecipe: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/haptics", () => ({
  triggerHaptic: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("expo-sqlite", () => ({}));

import { useSavedStore } from "../../stores/saved.store";
import { upsertRecipe, deleteRecipe } from "../../db/queries";
import { triggerHaptic } from "../../lib/haptics";
import { useSavedRecipes } from "../useSavedRecipes";
import type { RecipeDocument } from "@rr/shared";
import type { SQLiteDatabase } from "expo-sqlite";

const mockDb = {} as SQLiteDatabase;

const mockRecipe: RecipeDocument = {
  id: "recipe-1",
  source_url: "https://example.com/recipe",
  domain: "example.com",
  title: "Test Recipe",
  image_url: null,
  author: null,
  yields: "4 servings",
  prep_time: 10,
  cook_time: 20,
  total_time: 30,
  ingredients: ["flour", "sugar"],
  instructions: ["mix", "bake"],
  tags: ["dessert"],
  cuisine: null,
  category: null,
  keywords: ["easy"],
  schema_valid: true,
  extracted_at: "2024-01-01T00:00:00Z",
  last_checked: "2024-01-01T00:00:00Z",
};

function resetStore() {
  useSavedStore.setState({ ids: new Set<string>() });
}

describe("useSavedRecipes", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("returns isSaved, save, and unsave functions", () => {
    const result = useSavedRecipes({ db: mockDb });
    expect(typeof result.isSaved).toBe("function");
    expect(typeof result.save).toBe("function");
    expect(typeof result.unsave).toBe("function");
  });

  describe("isSaved", () => {
    it("delegates to the saved store", () => {
      useSavedStore.getState().addId("recipe-1");
      const { isSaved } = useSavedRecipes({ db: mockDb });
      expect(isSaved("recipe-1")).toBe(true);
      expect(isSaved("recipe-2")).toBe(false);
    });
  });

  describe("save", () => {
    it("inserts recipe into SQLite and adds to store", async () => {
      const { save } = useSavedRecipes({ db: mockDb });
      await save(mockRecipe);

      expect(upsertRecipe).toHaveBeenCalledWith(mockDb, mockRecipe);
      expect(useSavedStore.getState().isSaved("recipe-1")).toBe(true);
    });

    it("triggers haptic feedback", async () => {
      const { save } = useSavedRecipes({ db: mockDb });
      await save(mockRecipe);

      expect(triggerHaptic).toHaveBeenCalledWith("light");
    });
  });

  describe("unsave", () => {
    it("deletes from SQLite and removes from store", async () => {
      useSavedStore.getState().addId("recipe-1");
      const { unsave } = useSavedRecipes({ db: mockDb });
      await unsave("recipe-1");

      expect(deleteRecipe).toHaveBeenCalledWith(mockDb, "recipe-1");
      expect(useSavedStore.getState().isSaved("recipe-1")).toBe(false);
    });

    it("triggers haptic feedback", async () => {
      const { unsave } = useSavedRecipes({ db: mockDb });
      await unsave("recipe-1");

      expect(triggerHaptic).toHaveBeenCalledWith("light");
    });
  });
});
