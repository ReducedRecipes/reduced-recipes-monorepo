import { describe, it, expect, vi } from "vitest";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: {
    recipes: {
      search: vi.fn(),
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: vi.fn((opts: any) => opts),
}));

import { useSearch } from "../useSearch";

describe("useSearch", () => {
  it("exports a function", () => {
    expect(typeof useSearch).toBe("function");
  });

  it("is disabled when query has fewer than 2 characters", () => {
    const result = useSearch("a");
    expect(result.enabled).toBe(false);
  });

  it("is disabled for empty query", () => {
    const result = useSearch("");
    expect(result.enabled).toBe(false);
  });

  it("is disabled for whitespace-only query", () => {
    const result = useSearch("   ");
    expect(result.enabled).toBe(false);
  });

  it("is enabled when query has 2+ characters", () => {
    const result = useSearch("pa");
    expect(result.enabled).toBe(true);
  });

  it("trims whitespace before checking length", () => {
    const result = useSearch("  ab  ");
    expect(result.enabled).toBe(true);
    expect(result.queryKey).toEqual(["search", "ab", {}]);
  });

  it("includes filters in queryKey for cache isolation", () => {
    const result = useSearch("test", { tag: "vegan" });
    expect(result.queryKey).toEqual(["search", "test", { tag: "vegan" }]);
  });

  it("has initialPageParam of 0", () => {
    const result = useSearch("test");
    expect(result.initialPageParam).toBe(0);
  });

  it("calls api.recipes.search via queryFn with trimmed query and pagination", async () => {
    vi.mocked(api.recipes.search).mockResolvedValueOnce({
      items: [{ id: "1", title: "Pasta" }],
      has_more: false,
    } as any);

    const result = useSearch("  pasta  ");
    const data = await result.queryFn({ pageParam: 0 } as any);

    expect(api.recipes.search).toHaveBeenCalledWith("pasta", 20, 0);
    expect(data).toEqual({ items: [{ id: "1", title: "Pasta" }], has_more: false });
  });
});
