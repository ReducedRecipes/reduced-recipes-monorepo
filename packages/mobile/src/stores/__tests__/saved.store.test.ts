import { describe, it, expect, beforeEach } from "vitest";
import { useSavedStore } from "../saved.store";

function resetStore() {
  useSavedStore.setState({ ids: new Set<string>() });
}

describe("useSavedStore", () => {
  beforeEach(() => {
    resetStore();
  });

  it("starts with an empty set of ids", () => {
    const { ids } = useSavedStore.getState();
    expect(ids).toBeInstanceOf(Set);
    expect(ids.size).toBe(0);
  });

  describe("addId", () => {
    it("adds a recipe id to the set", () => {
      useSavedStore.getState().addId("recipe-1");
      expect(useSavedStore.getState().ids.has("recipe-1")).toBe(true);
    });

    it("does not duplicate an already-saved id", () => {
      useSavedStore.getState().addId("recipe-1");
      useSavedStore.getState().addId("recipe-1");
      expect(useSavedStore.getState().ids.size).toBe(1);
    });
  });

  describe("removeId", () => {
    it("removes an existing id from the set", () => {
      useSavedStore.getState().addId("recipe-1");
      useSavedStore.getState().removeId("recipe-1");
      expect(useSavedStore.getState().ids.has("recipe-1")).toBe(false);
      expect(useSavedStore.getState().ids.size).toBe(0);
    });

    it("is a no-op when removing a non-existent id", () => {
      useSavedStore.getState().removeId("missing");
      expect(useSavedStore.getState().ids.size).toBe(0);
    });
  });

  describe("isSaved", () => {
    it("returns true for a saved id", () => {
      useSavedStore.getState().addId("recipe-1");
      expect(useSavedStore.getState().isSaved("recipe-1")).toBe(true);
    });

    it("returns false for an unsaved id", () => {
      expect(useSavedStore.getState().isSaved("recipe-1")).toBe(false);
    });

    it("provides O(1) lookup via Set", () => {
      const ids = Array.from({ length: 1000 }, (_, i) => `r-${i}`);
      useSavedStore.getState().setIds(ids);
      expect(useSavedStore.getState().isSaved("r-500")).toBe(true);
      expect(useSavedStore.getState().isSaved("r-9999")).toBe(false);
    });
  });

  describe("setIds", () => {
    it("replaces the entire id set", () => {
      useSavedStore.getState().addId("old");
      useSavedStore.getState().setIds(["a", "b", "c"]);
      const { ids } = useSavedStore.getState();
      expect(ids.size).toBe(3);
      expect(ids.has("old")).toBe(false);
      expect(ids.has("a")).toBe(true);
      expect(ids.has("b")).toBe(true);
      expect(ids.has("c")).toBe(true);
    });
  });

  describe("hydrate", () => {
    it("loads ids from an array (simulating SQLite hydration)", () => {
      useSavedStore.getState().hydrate(["x", "y"]);
      const { ids } = useSavedStore.getState();
      expect(ids.size).toBe(2);
      expect(ids.has("x")).toBe(true);
      expect(ids.has("y")).toBe(true);
    });

    it("overwrites previously saved ids", () => {
      useSavedStore.getState().addId("old");
      useSavedStore.getState().hydrate(["new"]);
      expect(useSavedStore.getState().ids.has("old")).toBe(false);
      expect(useSavedStore.getState().ids.has("new")).toBe(true);
    });
  });

  describe("Set serialisation for MMKV persistence", () => {
    it("serialises Set as array and revives back to Set", () => {
      useSavedStore.getState().setIds(["a", "b"]);

      // Simulate persist serialisation round-trip
      const state = useSavedStore.getState();
      const json = JSON.stringify({ ids: state.ids }, (_key, value) => {
        if (value instanceof Set) return [...value];
        return value;
      });

      const parsed = JSON.parse(json, (key, value) => {
        if (key === "ids" && Array.isArray(value)) return new Set(value);
        return value;
      });

      expect(parsed.ids).toBeInstanceOf(Set);
      expect(parsed.ids.size).toBe(2);
      expect(parsed.ids.has("a")).toBe(true);
      expect(parsed.ids.has("b")).toBe(true);
    });
  });
});
