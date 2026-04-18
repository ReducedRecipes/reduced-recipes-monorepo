import type { RecipeDocument, RecipeSummary, User, Bookmark, Notification, Collection, BookmarkSyncAction, BookmarkSyncResult } from "@rr/shared";
import { buildQuery } from "@rr/shared/build-query";

const BASE_URL = `${import.meta.env.VITE_API_BASE || ""}/api/v1`;

interface ApiError {
  error: { code: number; message: string };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("session_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(
      body?.error?.message ?? `API error ${res.status}: ${res.statusText}`,
    );
  }
  return res.json() as Promise<T>;
}

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

// ── Auth ──

export function getGoogleAuthUrl(platform: "web" | "mobile", returnTo?: string): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(`/auth/google/url${buildQuery({ platform, return_to: returnTo })}`);
}

export function logout(): Promise<void> {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

export function getMe(): Promise<{ user: User }> {
  return apiFetch<{ user: User }>("/auth/me");
}

// ── Users ──

export async function getUser(id: string): Promise<User> {
  const res = await apiFetch<{ user: User }>(`/users/${encodeURIComponent(id)}`);
  return res.user;
}

export function updateProfile(data: { name?: string; profile_public?: boolean }): Promise<User> {
  return apiFetch<User>("/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteAccount(): Promise<void> {
  return apiFetch<void>("/users/me", { method: "DELETE" });
}

export function exportData(): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>("/users/me/export");
}

// ── Dietary Preferences ──

export function getDietaryPreferences(): Promise<{ restrictions: string[] }> {
  return apiFetch<{ restrictions: string[] }>("/users/me/dietary-preferences");
}

export function setDietaryPreferences(restrictions: string[]): Promise<{ restrictions: string[]; matching_recipe_count: number; updated_at: string }> {
  return apiFetch<{ restrictions: string[]; matching_recipe_count: number; updated_at: string }>("/users/me/dietary-preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restrictions }),
  });
}

export function getDietaryRecipeCount(restrictions: string[]): Promise<{ count: number }> {
  return apiFetch<{ count: number }>(`/dietary-preferences/recipe-count${buildQuery({ restrictions: restrictions.join(",") })}`);
}

// ── Bookmarks ──

export function createBookmark(recipeId: string, collectionId?: string): Promise<Bookmark> {
  return apiFetch<Bookmark>("/bookmarks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipe_id: recipeId, collection_id: collectionId ?? null }),
  });
}

export function deleteBookmark(id: string): Promise<void> {
  return apiFetch<void>(`/bookmarks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export interface BookmarkListResponse {
  items: Bookmark[];
  next_cursor: string | null;
}

export function getBookmarks(cursor?: string): Promise<BookmarkListResponse> {
  return apiFetch<BookmarkListResponse>(`/bookmarks${buildQuery({ cursor })}`);
}

// ── Notifications ──

export interface NotificationListResponse {
  items: Notification[];
  next_cursor: string | null;
}

export function getNotifications(cursor?: string): Promise<NotificationListResponse> {
  return apiFetch<NotificationListResponse>(`/notifications${buildQuery({ cursor })}`);
}

export function markNotificationRead(id: string): Promise<void> {
  return apiFetch<void>(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export function markAllNotificationsRead(): Promise<void> {
  return apiFetch<void>("/notifications/read-all", { method: "POST" });
}

export function getUnreadNotificationCount(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>("/notifications/unread-count");
}

// ── Collections ──

export interface CollectionListResponse {
  items: Collection[];
}

export function fetchCollections(): Promise<CollectionListResponse> {
  return apiFetch<CollectionListResponse>("/collections");
}

export function createCollection(data: { name: string; is_public?: boolean }): Promise<Collection> {
  return apiFetch<Collection>("/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateCollection(id: string, data: { name?: string; is_public?: boolean; position?: number }): Promise<Collection> {
  return apiFetch<Collection>(`/collections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteCollection(id: string): Promise<void> {
  return apiFetch<void>(`/collections/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function fetchCollectionBookmarks(id: string, cursor?: string, limit?: number): Promise<BookmarkListResponse> {
  return apiFetch<BookmarkListResponse>(`/collections/${encodeURIComponent(id)}/bookmarks${buildQuery({ cursor, limit })}`);
}

// ── Follow System ──

export function followUser(id: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/users/${encodeURIComponent(id)}/follow`, { method: "POST" });
}

export function unfollowUser(id: string): Promise<void> {
  return apiFetch<void>(`/users/${encodeURIComponent(id)}/follow`, { method: "DELETE" });
}

export interface FollowListItem {
  id: string;
  name: string;
  profile_image_url: string | null;
  is_following?: boolean;
}

export interface FollowListResponse {
  items: FollowListItem[];
  next_cursor: string | null;
}

export function fetchFollowers(id: string, cursor?: string, limit?: number): Promise<FollowListResponse> {
  return apiFetch<FollowListResponse>(`/users/${encodeURIComponent(id)}/followers${buildQuery({ cursor, limit })}`);
}

export function fetchFollowing(id: string, cursor?: string, limit?: number): Promise<FollowListResponse> {
  return apiFetch<FollowListResponse>(`/users/${encodeURIComponent(id)}/following${buildQuery({ cursor, limit })}`);
}

export function fetchUserCollections(id: string): Promise<CollectionListResponse> {
  return apiFetch<CollectionListResponse>(`/users/${encodeURIComponent(id)}/collections`);
}

// ── Bookmark Move & Search ──

export function moveBookmark(bookmarkId: string, targetCollectionId: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>("/bookmarks/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookmark_id: bookmarkId, target_collection_id: targetCollectionId }),
  });
}

export interface BookmarkSearchResponse {
  items: (Bookmark & RecipeSummary)[];
}

export function searchBookmarks(query: string, collectionId?: string): Promise<BookmarkSearchResponse> {
  return apiFetch<BookmarkSearchResponse>(`/bookmarks/search${buildQuery({ q: query, collection_id: collectionId })}`);
}

// ── Bookmark Sync ──

export interface BookmarkSyncResponse {
  results: BookmarkSyncResult[];
}

export function syncBookmarks(actions: BookmarkSyncAction[]): Promise<BookmarkSyncResponse> {
  return apiFetch<BookmarkSyncResponse>("/sync/bookmarks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actions }),
  });
}
