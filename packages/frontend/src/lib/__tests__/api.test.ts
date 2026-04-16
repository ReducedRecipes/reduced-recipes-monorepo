import { describe, it, expect, vi, beforeEach } from "vitest";

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
  getGoogleAuthUrl,
  logout,
  getMe,
  getBookmarks,
  addBookmark,
  removeBookmark,
  getNotifications,
  markNotificationRead,
  markAllRead,
  getUnreadCount,
  getDietaryPreferences,
  setDietaryPreferences,
  getRecipeCount,
  getProfile,
  updateProfile,
  deleteAccount,
  exportData,
} = await import("../api");

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function okResponse(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

function okBlobResponse() {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(null),
    blob: () => Promise.resolve(new Blob(["test"])),
  };
}

function errResponse(status: number, body?: unknown) {
  return {
    ok: false,
    status,
    statusText: "Bad Request",
    json: () => Promise.resolve(body ?? null),
  };
}

/** Helper to extract the options passed to fetch (2nd arg). */
function fetchOpts(): RequestInit {
  return mockFetch.mock.calls[0]![1] as RequestInit;
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Core apiFetch behaviour
// ---------------------------------------------------------------------------

describe("apiFetch", () => {
  it("always sends credentials: include", async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await fetchTags();
    expect(fetchOpts().credentials).toBe("include");
  });

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

// ---------------------------------------------------------------------------
// Existing functions (unchanged behaviour, updated for credentials)
// ---------------------------------------------------------------------------

describe("fetchRecipe", () => {
  it("calls GET /recipes/:id with credentials", async () => {
    const doc = { id: "abc", title: "Test" };
    mockFetch.mockResolvedValue(okResponse(doc));
    const result = await fetchRecipe("abc");
    expect(result).toEqual(doc);
    expect(mockFetch.mock.calls[0]![0]).toBe("/api/v1/recipes/abc");
    expect(fetchOpts().credentials).toBe("include");
  });

  it("encodes special characters in id", async () => {
    mockFetch.mockResolvedValue(okResponse({ id: "a/b" }));
    await fetchRecipe("a/b");
    expect(mockFetch.mock.calls[0]![0]).toBe("/api/v1/recipes/a%2Fb");
  });
});

describe("fetchRecipes", () => {
  it("calls GET /recipes with query params", async () => {
    mockFetch.mockResolvedValue(okResponse({ items: [], next_cursor: null }));
    await fetchRecipes({ tag: "vegan", limit: 10 });
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("/api/v1/recipes?");
    expect(url).toContain("tag=vegan");
    expect(url).toContain("limit=10");
  });

  it("calls GET /recipes with no params", async () => {
    mockFetch.mockResolvedValue(okResponse({ items: [], next_cursor: null }));
    await fetchRecipes();
    expect(mockFetch.mock.calls[0]![0]).toBe("/api/v1/recipes");
  });
});

describe("searchRecipes", () => {
  it("calls GET /search with q param", async () => {
    mockFetch.mockResolvedValue(okResponse({ items: [], has_more: false }));
    await searchRecipes("pasta", 5);
    const url = mockFetch.mock.calls[0]![0] as string;
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
    expect(mockFetch.mock.calls[0]![0]).toBe("/api/v1/tags");
  });
});

describe("fetchDomains", () => {
  it("calls GET /domains", async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await fetchDomains();
    expect(mockFetch.mock.calls[0]![0]).toBe("/api/v1/domains");
  });
});

describe("fetchDomainRecipes", () => {
  it("calls GET /domains/:domain/recipes", async () => {
    mockFetch.mockResolvedValue(okResponse({ items: [], next_cursor: null }));
    await fetchDomainRecipes("example.com", { cursor: "abc" });
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("/api/v1/domains/example.com/recipes?");
    expect(url).toContain("cursor=abc");
  });
});

describe("submitRemoval", () => {
  it("calls POST /remove with JSON body and credentials", async () => {
    mockFetch.mockResolvedValue(okResponse({ ok: true }));
    const data = { url: "http://x.com/r", email: "a@b.c", reason: "test" };
    const result = await submitRemoval(data);
    expect(result).toEqual({ ok: true });
    const opts = fetchOpts();
    expect(opts.credentials).toBe("include");
    expect(opts.method).toBe("POST");
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe("getGoogleAuthUrl", () => {
  it("calls GET /auth/google/url with platform=web", async () => {
    mockFetch.mockResolvedValue(okResponse({ url: "https://accounts.google.com/..." }));
    const result = await getGoogleAuthUrl("/recipes");
    expect(result.url).toContain("google.com");
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("platform=web");
    expect(url).toContain("return_to=%2Frecipes");
  });
});

describe("logout", () => {
  it("calls POST /auth/logout", async () => {
    mockFetch.mockResolvedValue(okResponse({ ok: true }));
    const result = await logout();
    expect(result).toEqual({ ok: true });
    expect(fetchOpts().method).toBe("POST");
  });
});

describe("getMe", () => {
  it("calls GET /auth/me", async () => {
    const user = { id: "u1", email: "a@b.c", name: "Test" };
    mockFetch.mockResolvedValue(okResponse({ user }));
    const result = await getMe();
    expect(result.user).toEqual(user);
    expect(mockFetch.mock.calls[0]![0]).toBe("/api/v1/auth/me");
  });
});

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

describe("getBookmarks", () => {
  it("calls GET /bookmarks with optional cursor", async () => {
    mockFetch.mockResolvedValue(okResponse({ items: [], next_cursor: null }));
    await getBookmarks({ cursor: "c1", limit: 5 });
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("cursor=c1");
    expect(url).toContain("limit=5");
  });
});

describe("addBookmark", () => {
  it("calls POST /bookmarks with recipe_id", async () => {
    const resp = { id: "b1", recipe_id: "r1", collection_id: "col1", created_at: "2024-01-01" };
    mockFetch.mockResolvedValue(okResponse(resp));
    const result = await addBookmark("r1");
    expect(result).toEqual(resp);
    expect(fetchOpts().method).toBe("POST");
    expect(JSON.parse(fetchOpts().body as string)).toEqual({ recipe_id: "r1" });
  });
});

describe("removeBookmark", () => {
  it("calls DELETE /bookmarks/:id", async () => {
    mockFetch.mockResolvedValue(okResponse({ ok: true }));
    await removeBookmark("b1");
    expect(mockFetch.mock.calls[0]![0]).toBe("/api/v1/bookmarks/b1");
    expect(fetchOpts().method).toBe("DELETE");
  });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

describe("getNotifications", () => {
  it("calls GET /notifications", async () => {
    mockFetch.mockResolvedValue(okResponse({ items: [], next_cursor: null }));
    await getNotifications();
    expect(mockFetch.mock.calls[0]![0]).toBe("/api/v1/notifications");
  });
});

describe("markNotificationRead", () => {
  it("calls POST /notifications/:id/read", async () => {
    mockFetch.mockResolvedValue(okResponse({ ok: true }));
    await markNotificationRead("n1");
    expect(mockFetch.mock.calls[0]![0]).toBe("/api/v1/notifications/n1/read");
    expect(fetchOpts().method).toBe("POST");
  });
});

describe("markAllRead", () => {
  it("calls POST /notifications/read-all", async () => {
    mockFetch.mockResolvedValue(okResponse({ ok: true }));
    await markAllRead();
    expect(mockFetch.mock.calls[0]![0]).toBe("/api/v1/notifications/read-all");
    expect(fetchOpts().method).toBe("POST");
  });
});

describe("getUnreadCount", () => {
  it("calls GET /notifications/unread-count", async () => {
    mockFetch.mockResolvedValue(okResponse({ count: 3 }));
    const result = await getUnreadCount();
    expect(result.count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Dietary preferences
// ---------------------------------------------------------------------------

describe("getDietaryPreferences", () => {
  it("calls GET /users/me/dietary-preferences", async () => {
    mockFetch.mockResolvedValue(okResponse({ restrictions: ["vegan"] }));
    const result = await getDietaryPreferences();
    expect(result.restrictions).toEqual(["vegan"]);
  });
});

describe("setDietaryPreferences", () => {
  it("calls PUT /users/me/dietary-preferences with body", async () => {
    mockFetch.mockResolvedValue(
      okResponse({ restrictions: ["vegan"], matching_recipe_count: 42, updated_at: "2024-01-01" }),
    );
    const result = await setDietaryPreferences(["vegan"]);
    expect(result.matching_recipe_count).toBe(42);
    expect(fetchOpts().method).toBe("PUT");
    expect(JSON.parse(fetchOpts().body as string)).toEqual({ restrictions: ["vegan"] });
  });
});

describe("getRecipeCount", () => {
  it("calls GET /dietary-preferences/recipe-count with restrictions param", async () => {
    mockFetch.mockResolvedValue(okResponse({ count: 100 }));
    await getRecipeCount(["vegan", "gluten-free"]);
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("restrictions=vegan%2Cgluten-free");
  });
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

describe("getProfile", () => {
  it("calls GET /users/:id", async () => {
    const user = { id: "u1", name: "Test" };
    mockFetch.mockResolvedValue(okResponse({ user }));
    await getProfile("u1");
    expect(mockFetch.mock.calls[0]![0]).toBe("/api/v1/users/u1");
  });
});

describe("updateProfile", () => {
  it("calls PATCH /users/me with body", async () => {
    mockFetch.mockResolvedValue(okResponse({ user: { id: "u1", name: "New" } }));
    await updateProfile({ name: "New" });
    expect(fetchOpts().method).toBe("PATCH");
    expect(JSON.parse(fetchOpts().body as string)).toEqual({ name: "New" });
  });
});

describe("deleteAccount", () => {
  it("calls DELETE /users/me", async () => {
    mockFetch.mockResolvedValue(okResponse({ ok: true }));
    await deleteAccount();
    expect(mockFetch.mock.calls[0]![0]).toBe("/api/v1/users/me");
    expect(fetchOpts().method).toBe("DELETE");
  });
});

describe("exportData", () => {
  it("calls GET /users/me/export and returns blob", async () => {
    mockFetch.mockResolvedValue(okBlobResponse());
    const blob = await exportData();
    expect(blob).toBeInstanceOf(Blob);
    expect(mockFetch.mock.calls[0]![0]).toBe("/api/v1/users/me/export");
  });
});
