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
  getGoogleAuthUrl,
  logout,
  getMe,
  getUser,
  updateProfile,
  deleteAccount,
  exportData,
  getDietaryPreferences,
  setDietaryPreferences,
  getDietaryRecipeCount,
  createBookmark,
  deleteBookmark,
  getBookmarks,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
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

/** Helper: expected fetch init with empty headers (no token) merged with given overrides */
function withHeaders(init?: RequestInit) {
  const base: RequestInit = { credentials: "include", headers: {} };
  if (!init) return base;
  const { headers: extraHeaders, ...rest } = init;
  return {
    ...base,
    ...rest,
    headers: { ...(extraHeaders as Record<string, string>) },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.removeItem("session_token");
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

  it("includes credentials: include on every request", async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await fetchTags();
    const init = mockFetch.mock.calls[0]![1];
    expect(init).toHaveProperty("credentials", "include");
  });
});

describe("fetchRecipe", () => {
  it("calls GET /recipes/:id", async () => {
    const doc = { id: "abc", title: "Test" };
    mockFetch.mockResolvedValue(okResponse(doc));
    const result = await fetchRecipe("abc");
    expect(result).toEqual(doc);
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/recipes/abc", withHeaders());
  });

  it("encodes special characters in id", async () => {
    mockFetch.mockResolvedValue(okResponse({ id: "a/b" }));
    await fetchRecipe("a/b");
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/recipes/a%2Fb", withHeaders());
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
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/recipes", withHeaders());
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
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/tags", withHeaders());
  });
});

describe("fetchDomains", () => {
  it("calls GET /domains", async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await fetchDomains();
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/domains", withHeaders());
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
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/remove", withHeaders({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }));
  });
});

// ── Phase 1a API functions ──

describe("getGoogleAuthUrl", () => {
  it("calls GET /auth/google/url with platform param", async () => {
    mockFetch.mockResolvedValue(okResponse({ url: "https://accounts.google.com/..." }));
    const result = await getGoogleAuthUrl("web");
    expect(result).toEqual({ url: "https://accounts.google.com/..." });
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("/api/v1/auth/google/url?");
    expect(url).toContain("platform=web");
  });

  it("includes return_to when provided", async () => {
    mockFetch.mockResolvedValue(okResponse({ url: "https://accounts.google.com/..." }));
    await getGoogleAuthUrl("mobile", "/profile");
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("return_to=%2Fprofile");
  });
});

describe("logout", () => {
  it("calls POST /auth/logout with credentials", async () => {
    mockFetch.mockResolvedValue(okResponse(undefined));
    await logout();
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/auth/logout", withHeaders({
      method: "POST",
    }));
  });
});

describe("getMe", () => {
  it("calls GET /auth/me and returns { user }", async () => {
    const user = { id: "u1", email: "test@test.com", name: "Test" };
    mockFetch.mockResolvedValue(okResponse({ user }));
    const result = await getMe();
    expect(result).toEqual({ user });
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/auth/me", withHeaders());
  });
});

describe("getUser", () => {
  it("calls GET /users/:id", async () => {
    const user = { id: "u1", name: "Test" };
    mockFetch.mockResolvedValue(okResponse({ user }));
    const result = await getUser("u1");
    expect(result).toEqual(user);
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/users/u1", withHeaders());
  });
});

describe("updateProfile", () => {
  it("calls PATCH /users/me with JSON body", async () => {
    const updated = { id: "u1", name: "New Name" };
    mockFetch.mockResolvedValue(okResponse(updated));
    const result = await updateProfile({ name: "New Name" });
    expect(result).toEqual(updated);
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/users/me", withHeaders({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    }));
  });
});

describe("deleteAccount", () => {
  it("calls DELETE /users/me", async () => {
    mockFetch.mockResolvedValue(okResponse(undefined));
    await deleteAccount();
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/users/me", withHeaders({
      method: "DELETE",
    }));
  });
});

describe("exportData", () => {
  it("calls GET /users/me/export", async () => {
    const data = { user: {}, bookmarks: [] };
    mockFetch.mockResolvedValue(okResponse(data));
    const result = await exportData();
    expect(result).toEqual(data);
  });
});

describe("getDietaryPreferences", () => {
  it("calls GET /users/me/dietary-preferences", async () => {
    mockFetch.mockResolvedValue(okResponse({ restrictions: ["vegan"] }));
    const result = await getDietaryPreferences();
    expect(result).toEqual({ restrictions: ["vegan"] });
  });
});

describe("setDietaryPreferences", () => {
  it("calls PUT /users/me/dietary-preferences with restrictions", async () => {
    mockFetch.mockResolvedValue(okResponse({ restrictions: ["vegan"], matching_recipe_count: 42, updated_at: "2026-01-01T00:00:00.000Z" }));
    const result = await setDietaryPreferences(["vegan"]);
    expect(result).toEqual({ restrictions: ["vegan"], matching_recipe_count: 42, updated_at: "2026-01-01T00:00:00.000Z" });
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/users/me/dietary-preferences", withHeaders({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restrictions: ["vegan"] }),
    }));
  });
});

describe("getDietaryRecipeCount", () => {
  it("calls GET /dietary-preferences/recipe-count with restrictions", async () => {
    mockFetch.mockResolvedValue(okResponse({ count: 100 }));
    const result = await getDietaryRecipeCount(["vegan", "gluten-free"]);
    expect(result).toEqual({ count: 100 });
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("/api/v1/dietary-preferences/recipe-count?");
    expect(url).toContain("restrictions=vegan%2Cgluten-free");
  });
});

describe("createBookmark", () => {
  it("calls POST /bookmarks with recipe_id", async () => {
    const bookmark = { id: "b1", recipe_id: "r1" };
    mockFetch.mockResolvedValue(okResponse(bookmark));
    const result = await createBookmark("r1");
    expect(result).toEqual(bookmark);
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/bookmarks", withHeaders({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe_id: "r1", collection_id: null }),
    }));
  });
});

describe("deleteBookmark", () => {
  it("calls DELETE /bookmarks/:id", async () => {
    mockFetch.mockResolvedValue(okResponse(undefined));
    await deleteBookmark("b1");
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/bookmarks/b1", withHeaders({
      method: "DELETE",
    }));
  });
});

describe("getBookmarks", () => {
  it("calls GET /bookmarks with optional cursor", async () => {
    mockFetch.mockResolvedValue(okResponse({ items: [], next_cursor: null }));
    await getBookmarks("abc");
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("/api/v1/bookmarks?");
    expect(url).toContain("cursor=abc");
  });
});

describe("getNotifications", () => {
  it("calls GET /notifications", async () => {
    mockFetch.mockResolvedValue(okResponse({ items: [], next_cursor: null }));
    await getNotifications();
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/notifications", withHeaders());
  });
});

describe("markNotificationRead", () => {
  it("calls POST /notifications/:id/read", async () => {
    mockFetch.mockResolvedValue(okResponse(undefined));
    await markNotificationRead("n1");
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/notifications/n1/read", withHeaders({
      method: "POST",
    }));
  });
});

describe("markAllNotificationsRead", () => {
  it("calls POST /notifications/read-all", async () => {
    mockFetch.mockResolvedValue(okResponse(undefined));
    await markAllNotificationsRead();
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/notifications/read-all", withHeaders({
      method: "POST",
    }));
  });
});

describe("getUnreadNotificationCount", () => {
  it("calls GET /notifications/unread-count", async () => {
    mockFetch.mockResolvedValue(okResponse({ count: 5 }));
    const result = await getUnreadNotificationCount();
    expect(result).toEqual({ count: 5 });
  });
});
