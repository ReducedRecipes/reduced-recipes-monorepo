import { describe, it, expect, vi } from "vitest";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: {
    recipes: {
      get: vi.fn(),
    },
  },
}));

// Since renderHook is not feasible with dual React versions in this monorepo,
// we test the hook's logic by importing it and verifying its structure.
// The hook is thin wrapper around useQuery, so we mock useQuery and verify the config.
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((opts: any) => opts),
}));

import { useRecipe } from "../useRecipe";

describe("useRecipe", () => {
  it("exports a function", () => {
    expect(typeof useRecipe).toBe("function");
  });

  it("returns query config with correct queryKey", () => {
    const result = useRecipe("abc-123");
    expect(result).toMatchObject({
      queryKey: ["recipe", "abc-123"],
      enabled: true,
    });
  });

  it("passes different ids to produce different queryKeys", () => {
    const r1 = useRecipe("id-1") as any;
    const r2 = useRecipe("id-2") as any;
    expect(r1.queryKey).toEqual(["recipe", "id-1"]);
    expect(r2.queryKey).toEqual(["recipe", "id-2"]);
  });

  it("is disabled when id is empty", () => {
    const result = useRecipe("") as any;
    expect(result.enabled).toBe(false);
  });

  it("calls api.recipes.get via queryFn", async () => {
    const recipe = { id: "abc", title: "Test" };
    vi.mocked(api.recipes.get).mockResolvedValueOnce(recipe as any);

    const result = useRecipe("abc") as any;
    const data = await result.queryFn();

    expect(api.recipes.get).toHaveBeenCalledWith("abc");
    expect(data).toEqual(recipe);
  });
});
