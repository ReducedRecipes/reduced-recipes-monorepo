import { describe, it, expect, vi } from "vitest";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: {
    recipes: {
      list: vi.fn(),
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: vi.fn((opts: any) => opts),
}));

import { useRecipes } from "../useRecipes";

describe("useRecipes", () => {
  it("exports a function", () => {
    expect(typeof useRecipes).toBe("function");
  });

  it("returns infinite query config with correct queryKey", () => {
    const result = useRecipes();
    expect(result).toMatchObject({
      queryKey: ["recipes", {}],
      initialPageParam: undefined,
    });
  });

  it("includes filter params in queryKey for cache isolation", () => {
    const r1 = useRecipes({ tag: "vegan" });
    const r2 = useRecipes({ max_time: 30 });
    expect(r1.queryKey).toEqual(["recipes", { tag: "vegan" }]);
    expect(r2.queryKey).toEqual(["recipes", { max_time: 30 }]);
  });

  it("calls api.recipes.list via queryFn with cursor from pageParam", async () => {
    const page = { items: [{ id: "1" }], next_cursor: "cur1" };
    vi.mocked(api.recipes.list).mockResolvedValueOnce(page as any);

    const result = useRecipes({ tag: "quick" });
    const data = await result.queryFn({ pageParam: "my-cursor" });

    expect(api.recipes.list).toHaveBeenCalledWith({
      tag: "quick",
      cursor: "my-cursor",
    });
    expect(data).toEqual(page);
  });

  it("getNextPageParam extracts next_cursor", () => {
    const result = useRecipes();
    const next = result.getNextPageParam({ items: [], next_cursor: "abc" } as any);
    expect(next).toBe("abc");
  });

  it("getNextPageParam returns undefined when next_cursor is null", () => {
    const result = useRecipes();
    const next = result.getNextPageParam({ items: [], next_cursor: null } as any);
    expect(next).toBeUndefined();
  });
});
