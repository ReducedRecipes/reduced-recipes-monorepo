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
  useQuery: vi.fn((opts: any) => opts),
  keepPreviousData: Symbol.for("keepPreviousData"),
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
    // queryKey should use trimmed value
    expect(result.queryKey).toEqual(["search", "ab", {}]);
  });

  it("includes filters in queryKey for cache isolation", () => {
    const result = useSearch("test", { tag: "vegan" });
    expect(result.queryKey).toEqual(["search", "test", { tag: "vegan" }]);
  });

  it("uses keepPreviousData as placeholderData", () => {
    const result = useSearch("test");
    expect(result.placeholderData).toBe(Symbol.for("keepPreviousData"));
  });

  it("calls api.recipes.search via queryFn with trimmed query", async () => {
    vi.mocked(api.recipes.search).mockResolvedValueOnce([
      { id: "1", title: "Pasta" },
    ] as any);

    const result = useSearch("  pasta  ");
    const data = await result.queryFn();

    expect(api.recipes.search).toHaveBeenCalledWith("pasta");
    expect(data).toEqual([{ id: "1", title: "Pasta" }]);
  });
});
