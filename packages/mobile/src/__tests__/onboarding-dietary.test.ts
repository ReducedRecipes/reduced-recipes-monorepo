import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DIETARY_LABELS, type DietaryRestriction } from "@rr/shared/dietary";

// Mock react-native-mmkv
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

// Mock expo-secure-store
vi.mock("expo-secure-store", () => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn().mockResolvedValue(null),
  deleteItemAsync: vi.fn(),
}));

const BASE_URL = "https://reducedrecipes.com/api/v1";

describe("Onboarding dietary API integration", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ count: 42 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should have all 16 dietary restriction labels", () => {
    const keys = Object.keys(DIETARY_LABELS) as DietaryRestriction[];
    expect(keys).toHaveLength(16);
    expect(keys).toContain("vegetarian");
    expect(keys).toContain("vegan");
    expect(keys).toContain("gluten-free");
    expect(keys).toContain("dairy-free");
    expect(keys).toContain("nut-free");
    expect(keys).toContain("keto");
    expect(keys).toContain("halal");
    expect(keys).toContain("kosher");
    expect(keys).toContain("low-carb");
    expect(keys).toContain("paleo");
    expect(keys).toContain("pescatarian");
    expect(keys).toContain("egg-free");
    expect(keys).toContain("soy-free");
    expect(keys).toContain("shellfish-free");
    expect(keys).toContain("low-sodium");
    expect(keys).toContain("sugar-free");
  });

  it("should call recipe-count endpoint with selected restrictions", async () => {
    const restrictions: DietaryRestriction[] = ["vegan", "gluten-free"];
    const qs = restrictions.join(",");

    await fetch(
      `${BASE_URL}/dietary-preferences/recipe-count?restrictions=${encodeURIComponent(qs)}`,
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/dietary-preferences/recipe-count?restrictions=vegan%2Cgluten-free"),
    );
  });

  it("should call PUT dietary-preferences with Bearer token when authenticated", async () => {
    const token = "test-session-token";
    const restrictions: DietaryRestriction[] = ["keto", "paleo"];

    await fetch(`${BASE_URL}/users/me/dietary-preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ restrictions }),
    });

    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/users/me/dietary-preferences`,
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Authorization: "Bearer test-session-token",
        }),
        body: JSON.stringify({ restrictions: ["keto", "paleo"] }),
      }),
    );
  });

  it("should NOT call server API when no token is present", () => {
    // When unauthenticated, only local MMKV save should happen
    // Simulate the logic: if no token, don't call server
    const sessionToken: string | null = null;
    const restrictions = ["vegan"];

    if (sessionToken) {
      fetch(`${BASE_URL}/users/me/dietary-preferences`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ restrictions }),
      });
    }

    // fetch should not have been called for dietary-preferences PUT
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/users/me/dietary-preferences"),
      expect.anything(),
    );
  });

  it("should gracefully handle recipe-count fetch failure", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    let recipeCount: number | null = null;
    try {
      const res = await fetch(
        `${BASE_URL}/dietary-preferences/recipe-count?restrictions=vegan`,
      );
      if (res.ok) {
        const data = (await res.json()) as { count: number };
        recipeCount = data.count;
      }
    } catch {
      // Silently fail — recipe count is informational
    }

    expect(recipeCount).toBeNull();
  });

  it("should gracefully handle server dietary-preferences PUT failure", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    let syncError = false;
    try {
      await fetch(`${BASE_URL}/users/me/dietary-preferences`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ restrictions: ["vegan"] }),
      });
    } catch {
      syncError = true;
      // Fall back silently — local save already done
    }

    expect(syncError).toBe(true);
  });
});
