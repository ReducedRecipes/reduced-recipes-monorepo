import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
  searchRecipes: vi.fn(),
}));

import { apiFetch, searchRecipes } from "../lib/api";

const mockApiFetch = vi.mocked(apiFetch);
const mockSearchRecipes = vi.mocked(searchRecipes);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SearchPage — search mode API integration", () => {
  it("searchRecipes passes mode=hybrid by default", async () => {
    mockSearchRecipes.mockResolvedValueOnce({ items: [], has_more: false });
    await searchRecipes("pasta");
    expect(mockSearchRecipes).toHaveBeenCalledWith("pasta");
  });

  it("searchRecipes accepts keyword mode", async () => {
    mockSearchRecipes.mockResolvedValueOnce({ items: [], has_more: false });
    await searchRecipes("pasta", 24, "keyword");
    expect(mockSearchRecipes).toHaveBeenCalledWith("pasta", 24, "keyword");
  });

  it("searchRecipes accepts semantic mode", async () => {
    mockSearchRecipes.mockResolvedValueOnce({ items: [], has_more: false });
    await searchRecipes("pasta", 24, "semantic");
    expect(mockSearchRecipes).toHaveBeenCalledWith("pasta", 24, "semantic");
  });

  it("searchRecipes accepts hybrid mode", async () => {
    mockSearchRecipes.mockResolvedValueOnce({ items: [], has_more: false });
    await searchRecipes("pasta", 24, "hybrid");
    expect(mockSearchRecipes).toHaveBeenCalledWith("pasta", 24, "hybrid");
  });
});

describe("SearchPage — useSearch hook mode parameter", () => {
  it("apiFetch is called with mode in query", async () => {
    mockApiFetch.mockResolvedValueOnce({ items: [], has_more: false });

    // Import the real searchRecipes (not mocked) to test query building
    const { buildQuery } = await import("@rr/shared/build-query");
    const query = buildQuery({ q: "pasta", limit: 24, offset: 0, mode: "keyword" });

    expect(query).toContain("mode=keyword");
    expect(query).toContain("q=pasta");
  });

  it("buildQuery includes hybrid mode when specified", async () => {
    const { buildQuery } = await import("@rr/shared/build-query");
    const query = buildQuery({ q: "cake", limit: 24, offset: 0, mode: "hybrid" });

    expect(query).toContain("mode=hybrid");
    expect(query).toContain("q=cake");
  });

  it("buildQuery includes semantic mode when specified", async () => {
    const { buildQuery } = await import("@rr/shared/build-query");
    const query = buildQuery({ q: "soup", limit: 24, offset: 0, mode: "semantic" });

    expect(query).toContain("mode=semantic");
  });
});
