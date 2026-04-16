import type { RecipeDocument, RecipeSummary, User, Bookmark, Notification } from "@rr/shared";

const BASE_URL = `${import.meta.env.VITE_API_BASE || ""}/api/v1`;

interface ApiError {
  error: { code: number; message: string };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(
      body?.error?.message ?? `API error ${res.status}: ${res.statusText}`,
    );
  }
  return res.json() as Promise<T>;
}

/** Raw fetch with credentials for non-JSON responses. */
async function apiRawFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(
      body?.error?.message ?? `API error ${res.status}: ${res.statusText}`,
    );
  }
  return res;
}

// ---------------------------------------------------------------------------
// Existing recipe/search/tag/domain functions
// ---------------------------------------------------------------------------

export function fetchRecipe(id: string): Promise<RecipeDocument> {
  return apiFetch<RecipeDocument>(`/recipes/${encodeURIComponent(id)}`);
}

export interface RecipeListResponse {
  items: RecipeSummary[];
  next_cursor: string | null;
}

export interface RecipeListParams {
  tag?: string;
  domain?: string;
  cuisine?: string;
  max_time?: number;
  min_time?: number;
  cursor?: string;
  limit?: number;
}

function buildQuery(params: { [key: string]: string | number | undefined }): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function fetchRecipes(
  params: RecipeListParams = {},
): Promise<RecipeListResponse> {
  return apiFetch<RecipeListResponse>(`/recipes${buildQuery({ ...params })}`);
}

export interface SearchResponse {
  items: RecipeSummary[];
  has_more: boolean;
}

export function searchRecipes(
  q: string,
  limit?: number,
): Promise<SearchResponse> {
  return apiFetch<SearchResponse>(`/search${buildQuery({ q, limit })}`);
}

export function fetchTags(): Promise<{ tag: string; count: number }[]> {
  return apiFetch<{ tag: string; count: number }[]>("/tags");
}

export function fetchDomains(): Promise<
  { domain: string; recipe_count: number; last_spidered: string }[]
> {
  return apiFetch<
    { domain: string; recipe_count: number; last_spidered: string }[]
  >("/domains");
}

export function fetchDomainRecipes(
  domain: string,
  params: Omit<RecipeListParams, "domain"> = {},
): Promise<RecipeListResponse> {
  return apiFetch<RecipeListResponse>(
    `/domains/${encodeURIComponent(domain)}/recipes${buildQuery({ ...params })}`,
  );
}

export function submitRemoval(data: {
  url: string;
  email: string;
  reason: string;
}): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function getGoogleAuthUrl(returnTo: string): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(
    `/auth/google/url${buildQuery({ platform: "web", return_to: returnTo })}`,
  );
}

export function logout(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/auth/logout", { method: "POST" });
}

export function getMe(): Promise<{ user: User }> {
  return apiFetch<{ user: User }>("/auth/me");
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export function getBookmarks(params?: {
  cursor?: string;
  limit?: number;
}): Promise<{ items: Bookmark[]; next_cursor: string | null }> {
  return apiFetch<{ items: Bookmark[]; next_cursor: string | null }>(
    `/bookmarks${buildQuery({ ...params })}`,
  );
}

export function addBookmark(
  recipeId: string,
): Promise<{ id: string; recipe_id: string; collection_id: string; created_at: string }> {
  return apiFetch<{ id: string; recipe_id: string; collection_id: string; created_at: string }>(
    "/bookmarks",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe_id: recipeId }),
    },
  );
}

export function removeBookmark(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/bookmarks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export function getNotifications(params?: {
  cursor?: string;
  limit?: number;
}): Promise<{ items: Notification[]; next_cursor: string | null }> {
  return apiFetch<{ items: Notification[]; next_cursor: string | null }>(
    `/notifications${buildQuery({ ...params })}`,
  );
}

export function markNotificationRead(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
  });
}

export function markAllRead(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/notifications/read-all", { method: "POST" });
}

export function getUnreadCount(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>("/notifications/unread-count");
}

// ---------------------------------------------------------------------------
// Dietary preferences
// ---------------------------------------------------------------------------

export function getDietaryPreferences(): Promise<{ restrictions: string[] }> {
  return apiFetch<{ restrictions: string[] }>("/users/me/dietary-preferences");
}

export function setDietaryPreferences(
  restrictions: string[],
): Promise<{ restrictions: string[]; matching_recipe_count: number; updated_at: string }> {
  return apiFetch<{ restrictions: string[]; matching_recipe_count: number; updated_at: string }>(
    "/users/me/dietary-preferences",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restrictions }),
    },
  );
}

export function getRecipeCount(
  restrictions: string[],
): Promise<{ count: number }> {
  return apiFetch<{ count: number }>(
    `/dietary-preferences/recipe-count${buildQuery({ restrictions: restrictions.join(",") })}`,
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function getProfile(id: string): Promise<{ user: User }> {
  return apiFetch<{ user: User }>(`/users/${encodeURIComponent(id)}`);
}

export function updateProfile(data: {
  name?: string;
  profile_public?: boolean;
}): Promise<{ user: User }> {
  return apiFetch<{ user: User }>("/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteAccount(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/users/me", { method: "DELETE" });
}

export async function exportData(): Promise<Blob> {
  const res = await apiRawFetch("/users/me/export");
  return res.blob();
}
