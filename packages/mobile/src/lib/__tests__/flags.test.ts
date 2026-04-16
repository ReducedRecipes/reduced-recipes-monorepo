import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStore = new Map<string, string>();

vi.mock("react-native-mmkv", () => ({
  MMKV: vi.fn().mockImplementation(() => ({
    getString: (key: string) => mockStore.get(key),
    set: (key: string, value: string) => mockStore.set(key, value),
    delete: (key: string) => mockStore.delete(key),
  })),
}));

import { DEFAULT_FLAGS, useFlag } from "../flags";
import type { Flag } from "../flags";

describe("DEFAULT_FLAGS", () => {
  it("has the correct default values", () => {
    expect(DEFAULT_FLAGS).toEqual({
      voiceGuidance: true,
      shoppingList: true,
      mealPlanning: false,
      householdShare: false,
      offlineSync: true,
      pushNotifications: true,
    });
  });
});

describe("useFlag", () => {
  beforeEach(() => {
    mockStore.clear();
  });

  it("returns default value when no override exists", () => {
    const flags: Flag[] = [
      "voiceGuidance",
      "shoppingList",
      "mealPlanning",
      "householdShare",
      "offlineSync",
      "pushNotifications",
    ];

    for (const flag of flags) {
      expect(useFlag(flag)).toBe(DEFAULT_FLAGS[flag]);
    }
  });

  it("returns true when override is 'true'", () => {
    mockStore.set("flag:mealPlanning", "true");
    expect(useFlag("mealPlanning")).toBe(true);
  });

  it("returns false when override is 'false'", () => {
    mockStore.set("flag:voiceGuidance", "false");
    expect(useFlag("voiceGuidance")).toBe(false);
  });

  it("returns default when override is cleared", () => {
    mockStore.set("flag:offlineSync", "false");
    expect(useFlag("offlineSync")).toBe(false);

    mockStore.delete("flag:offlineSync");
    expect(useFlag("offlineSync")).toBe(true);
  });
});
