import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError } from "../api";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(data),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("request headers", () => {
  it("sets Content-Type and X-Client headers", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ tag: "pasta", count: 5 }));

    await api.tags.list();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["X-Client"]).toBe("rr-mobile/1.0");
  });
});

describe("ApiError", () => {
  it("throws ApiError with status and message on non-OK response", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: { message: "Not found" } }, 404),
    );

    await expect(api.recipes.get("missing-id")).rejects.toThrow(ApiError);

    try {
      await api.recipes.get("missing-id");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(404);
      expect((e as ApiError).message).toBe("Not found");
    }
  });

  it("falls back to generic message when body has no error field", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new Error("bad json")),
    });

    await expect(api.recipes.get("x")).rejects.toThrow(
      "API error 500: Internal Server Error",
    );
  });
});

describe("api.recipes.list", () => {
  it("fetches recipes with query params", async () => {
    const data = { items: [], next_cursor: null };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await api.recipes.list({ tag: "pasta", limit: 10 });

    expect(result).toEqual(data);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/v1/recipes?");
    expect(url).toContain("tag=pasta");
    expect(url).toContain("limit=10");
  });

  it("omits undefined params", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ items: [], next_cursor: null }));

    await api.recipes.list({ tag: undefined });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).not.toContain("tag=");
  });
});

describe("api.recipes.get", () => {
  it("fetches a single recipe by id", async () => {
    const doc = { id: "abc", title: "Test Recipe" };
    mockFetch.mockResolvedValue(jsonResponse(doc));

    const result = await api.recipes.get("abc");

    expect(result).toEqual(doc);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/v1/recipes/abc");
  });

  it("encodes special characters in id", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: "a/b" }));

    await api.recipes.get("a/b");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/v1/recipes/a%2Fb");
  });
});

describe("api.recipes.search", () => {
  it("builds correct search URL", async () => {
    mockFetch.mockResolvedValue(jsonResponse([]));

    await api.recipes.search("chicken", 5);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/v1/search?");
    expect(url).toContain("q=chicken");
    expect(url).toContain("limit=5");
  });
});

describe("api.tags.list", () => {
  it("fetches tags", async () => {
    const tags = [{ tag: "pasta", count: 10 }];
    mockFetch.mockResolvedValue(jsonResponse(tags));

    const result = await api.tags.list();

    expect(result).toEqual(tags);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/v1/tags");
  });
});

describe("URL construction", () => {
  it("uses EXPO_PUBLIC_API_BASE with fallback", async () => {
    mockFetch.mockResolvedValue(jsonResponse([]));

    await api.tags.list();

    const url = mockFetch.mock.calls[0][0] as string;
    // Default fallback is https://reducedrecipes.com
    expect(url).toMatch(/^https:\/\/reducedrecipes\.com\/api\/v1\/tags$/);
  });
});
