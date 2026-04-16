import { describe, it, expect } from "vitest";
import {
  DIETARY_FLAGS,
  DIETARY_LABELS,
  restrictionsToMask,
  maskToRestrictions,
  isValidRestriction,
} from "../dietary";

describe("DIETARY_FLAGS", () => {
  it("has 16 entries", () => {
    expect(Object.keys(DIETARY_FLAGS)).toHaveLength(16);
  });

  it("assigns correct bit values", () => {
    expect(DIETARY_FLAGS["vegetarian"]).toBe(1);
    expect(DIETARY_FLAGS["vegan"]).toBe(2);
    expect(DIETARY_FLAGS["gluten-free"]).toBe(4);
    expect(DIETARY_FLAGS["dairy-free"]).toBe(8);
    expect(DIETARY_FLAGS["sugar-free"]).toBe(32768);
  });

  it("each flag is a unique power of 2", () => {
    const values = Object.values(DIETARY_FLAGS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
    for (const v of values) {
      expect(v > 0 && (v & (v - 1)) === 0).toBe(true);
    }
  });
});

describe("DIETARY_LABELS", () => {
  it("has a label for every flag", () => {
    for (const key of Object.keys(DIETARY_FLAGS)) {
      expect(DIETARY_LABELS[key]).toBeDefined();
    }
  });
});

describe("restrictionsToMask", () => {
  it("returns 0 for empty array", () => {
    expect(restrictionsToMask([])).toBe(0);
  });

  it("returns correct mask for single restriction", () => {
    expect(restrictionsToMask(["vegetarian"])).toBe(1);
    expect(restrictionsToMask(["vegan"])).toBe(2);
  });

  it("returns combined mask for multiple restrictions", () => {
    expect(restrictionsToMask(["vegetarian", "gluten-free"])).toBe(5);
  });

  it("ignores invalid restriction names", () => {
    expect(restrictionsToMask(["vegetarian", "invalid"])).toBe(1);
  });

  it("handles all 16 restrictions", () => {
    const all = Object.keys(DIETARY_FLAGS);
    const mask = restrictionsToMask(all);
    expect(mask).toBe(65535); // 2^16 - 1
  });
});

describe("maskToRestrictions", () => {
  it("returns empty array for 0", () => {
    expect(maskToRestrictions(0)).toEqual([]);
  });

  it("returns single restriction for single bit", () => {
    expect(maskToRestrictions(1)).toEqual(["vegetarian"]);
    expect(maskToRestrictions(2)).toEqual(["vegan"]);
  });

  it("returns multiple restrictions for combined mask", () => {
    const result = maskToRestrictions(5);
    expect(result).toContain("vegetarian");
    expect(result).toContain("gluten-free");
    expect(result).toHaveLength(2);
  });

  it("round-trips with restrictionsToMask", () => {
    const input = ["vegan", "keto", "paleo"];
    const mask = restrictionsToMask(input);
    const output = maskToRestrictions(mask);
    expect(output.sort()).toEqual(input.sort());
  });
});

describe("isValidRestriction", () => {
  it("returns true for valid restrictions", () => {
    expect(isValidRestriction("vegetarian")).toBe(true);
    expect(isValidRestriction("gluten-free")).toBe(true);
    expect(isValidRestriction("sugar-free")).toBe(true);
  });

  it("returns false for invalid restrictions", () => {
    expect(isValidRestriction("invalid")).toBe(false);
    expect(isValidRestriction("")).toBe(false);
    expect(isValidRestriction("Vegetarian")).toBe(false);
  });
});
