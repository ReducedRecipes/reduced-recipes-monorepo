import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock import.meta.env before importing the module
vi.stubEnv("VITE_API_BASE", "");

const {
  fetchRecipe,
  fetchRecipes,
  searchRecipes,
  fetchTags,
  fetchDomains,
  fetchDomainRecipes,
  submitRemoval,
} = await import("../api");

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function okResponse(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

function errResponse(status: number, body?: unknown) {
  return {
    ok: false,
    status,
    statusText: "Bad Request",
    json: () => Promise.resolve(body ?? null),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("apiFetch", () => {
  it("throws on non-ok response with error body", async () => {
    mockFetch.mockResolvedValue(
      errResponse(401, { error: { code: 401, message: "Unauthorized" } }),
    );
    await expect(fetchTags()).rejects.toThrow("Unauthorized");
  });

  it("throws with status text when no error body", async () => {
    mockFetch.mockResolvedValue(errResponse(500));
    await expect(fetchTags()).rejects.toThrow("API error 500");
  });
});

describe("fetchRecipe", () => {
  it("calls GET /recipes/:id", async () => {
    const doc = { id: "abc", title: "Test" };
    mockFetch.mockResolvedValue(okResponse(doc));
    const result = await fetchRecipe("abc");
    expect(result).toEqual(doc);
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/recipes/abc", undefined);
  });

  it("encodes special characters in id", async () => {
    mockFetch.mockResolvedValue(okResponse({ id: "a/b" }));
    await fetchRecipe("a/b");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/recipes/a%2Fb",
      undefined,
    );
  });
});

describe("fetchRecipes", () => {
  it("calls GET /recipes with query params", async () => {
    mockFetch.mockResolvedValue(
      okResponse({ items: [], next_cursor: null }),
    );
    await fetchRecipes({ tag: "vegan", limit: 10 });
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("/api/v1/recipes?");
    expect(url).toContain("tag=vegan");
    expect(url).toContain("limit=10");
  });

  it("calls GET /recipes with no params", async () => {
    mockFetch.mockResolvedValue(
      okResponse({ items: [], next_cursor: null }),
    );
    await fetchRecipes();
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/recipes", undefined);
  });
});

describe("searchRecipes", () => {
  it("calls GET /search with q param", async () => {
    mockFetch.mockResolvedValue(okResponse({ items: [], has_more: false }));
    await searchRecipes("pasta", 5);
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("/api/v1/search?");
    expect(url).toContain("q=pasta");
    expect(url).toContain("limit=5");
  });
});

describe("fetchTags", () => {
  it("calls GET /tags", async () => {
    const tags = [{ tag: "vegan", count: 10 }];
    mockFetch.mockResolvedValue(okResponse(tags));
    const result = await fetchTags();
    expect(result).toEqual(tags);
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/tags", undefined);
  });
});

describe("fetchDomains", () => {
  it("calls GET /domains", async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await fetchDomains();
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/domains", undefined);
  });
});

describe("fetchDomainRecipes", () => {
  it("calls GET /domains/:domain/recipes", async () => {
    mockFetch.mockResolvedValue(
      okResponse({ items: [], next_cursor: null }),
    );
    await fetchDomainRecipes("example.com", { cursor: "abc" });
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("/api/v1/domains/example.com/recipes?");
    expect(url).toContain("cursor=abc");
  });
});

describe("submitRemoval", () => {
  it("calls POST /remove with JSON body", async () => {
    mockFetch.mockResolvedValue(okResponse({ ok: true }));
    const data = { url: "http://x.com/r", email: "a@b.c", reason: "test" };
    const result = await submitRemoval(data);
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  });
});
