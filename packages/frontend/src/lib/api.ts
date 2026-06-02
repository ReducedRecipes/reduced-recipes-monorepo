import type { RecipeDocument, RecipeSummary, User, Bookmark, Notification, Collection, BookmarkSyncAction, BookmarkSyncResult, ShoppingList, ShoppingListItem, SmartRollupItem } from "@rr/shared";
import { buildQuery } from "@rr/shared/build-query";
import type { PantryRecipeResult, PantryState } from '@rr/shared/pantry';
export type { PantryRecipeResult, PantryState };

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
  tags?: string;
  domain?: string;
  cuisine?: string;
  max_time?: number;
  min_time?: number;
  sort?: string;
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

export type SearchMode = "keyword" | "semantic" | "hybrid";

export function searchRecipes(
  q: string,
  limit?: number,
  mode: SearchMode = "hybrid",
): Promise<SearchResponse> {
  return apiFetch<SearchResponse>(`/search${buildQuery({ q, limit, mode })}`);
}

export interface HealthResponse {
  ok: boolean;
  total_recipes: number;
  pending_crawls: number;
  failed_crawls: number;
  active_domains: number;
  total_words_removed: number;
  total_ads_removed: number;
  avg_cook_time: number;
  under_20_min: number;
  under_30_min: number;
  sources_count: number;
  translated_count: number;
  new_this_week: number;
  vegetarian: number;
  vegan: number;
  one_pan: number;
  gluten_free: number;
  keto: number;
  translated_recipes: number;
  featured_recipe_id: string | null;
  featured_recipe_title: string | null;
}

export function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health");
}

export interface FundingResponse {
  current_month: string;
  monthly_cost: number;
  cost_breakdown: {
    month: string;
    d1_reads: number;
    workers_ai: number;
    queues: number;
    kv: number;
    durable_objects: number;
    r2: number;
    workers_base: number;
    other: number;
    total: number;
    notes: string | null;
  } | null;
  cost_history: Array<Record<string, unknown>>;
  funded_this_month: number;
  funded_all_time: number;
  recent_donations: Array<{
    name: string;
    amount: number;
    message: string | null;
    created_at: string;
  }>;
}

export function fetchFunding(): Promise<FundingResponse> {
  return apiFetch<FundingResponse>("/funding");
}

export function suggestIngredients(q: string, limit = 10): Promise<{ items: { name: string; count: number }[] }> {
  return apiFetch<{ items: { name: string; count: number }[] }>(`/ingredients/suggest${buildQuery({ q, limit })}`);
}

export function searchByIngredients(
  have: string[],
  exclude: string[],
  limit = 24,
  offset = 0,
  maxMissing?: number,
): Promise<{ items: PantryRecipeResult[]; has_more: boolean }> {
  const params: Record<string, string | number> = { have: have.join(','), limit, offset };
  if (exclude.length > 0) params.exclude = exclude.join(',');
  if (maxMissing !== undefined) params.max_missing = maxMissing;
  return apiFetch<{ items: PantryRecipeResult[]; has_more: boolean }>(`/search/by-ingredients${buildQuery(params)}`);
}

export function getPantry(): Promise<{ pantry: PantryState }> {
  return apiFetch('/me/pantry');
}

export function putPantry(pantry: PantryState): Promise<{ pantry: PantryState }> {
  return apiFetch('/me/pantry', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pantry }),
  });
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

// ── Shopping Lists ──

export interface ShoppingListSummary extends ShoppingList {
  item_count: number;
  recipe_count: number;
  recipe_ids?: string;
  member_count?: number;
  role?: 'owner' | 'member';
  is_shared?: number;
  owner_name?: string | null;
}

export interface ShoppingListListResponse {
  items: ShoppingListSummary[];
}

export interface ShoppingListDetailResponse extends ShoppingList {
  items: { unchecked: SmartRollupItem[]; checked: SmartRollupItem[] };
  recipes?: Record<string, string>;
}

export interface ShareLinkResponse {
  share_token: string;
  expires_at: string;
  share_url?: string;
}

export function fetchShoppingLists(): Promise<ShoppingListListResponse> {
  return apiFetch<ShoppingListListResponse>("/shopping-lists");
}

export function createShoppingList(data: { name?: string }): Promise<ShoppingList> {
  return apiFetch<ShoppingList>("/shopping-lists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function getShoppingList(id: string): Promise<ShoppingListDetailResponse> {
  return apiFetch<ShoppingListDetailResponse>(`/shopping-lists/${encodeURIComponent(id)}`);
}

export function updateShoppingList(id: string, data: { name: string }): Promise<ShoppingList> {
  return apiFetch<ShoppingList>(`/shopping-lists/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteShoppingList(id: string): Promise<void> {
  return apiFetch<void>(`/shopping-lists/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function addRecipeToList(listId: string, data: { recipe_id: string; ingredients: string[] }): Promise<{ items: { id: string; original_text: string }[]; already_added?: boolean }> {
  return apiFetch<{ items: { id: string; original_text: string }[]; already_added?: boolean }>(`/shopping-lists/${encodeURIComponent(listId)}/recipes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function removeRecipeFromList(listId: string, recipeId: string): Promise<void> {
  return apiFetch<void>(`/shopping-lists/${encodeURIComponent(listId)}/recipes/${encodeURIComponent(recipeId)}`, { method: "DELETE" });
}

export function addManualItem(listId: string, data: { name: string; quantity?: number; unit?: string }): Promise<ShoppingListItem> {
  return apiFetch<ShoppingListItem>(`/shopping-lists/${encodeURIComponent(listId)}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateItem(listId: string, itemId: string, data: { checked?: number; quantity?: number; unit?: string; name?: string }): Promise<ShoppingListItem> {
  return apiFetch<ShoppingListItem>(`/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteItem(listId: string, itemId: string): Promise<void> {
  return apiFetch<void>(`/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
}

export function uncheckAll(listId: string): Promise<{ count: number }> {
  return apiFetch<{ count: number }>(`/shopping-lists/${encodeURIComponent(listId)}/uncheck-all`, { method: "POST" });
}

export function createShareLink(listId: string): Promise<ShareLinkResponse> {
  return apiFetch<ShareLinkResponse>(`/shopping-lists/${encodeURIComponent(listId)}/share`, { method: "POST" });
}

export function revokeShareLink(listId: string): Promise<void> {
  return apiFetch<void>(`/shopping-lists/${encodeURIComponent(listId)}/share`, { method: "DELETE" });
}

export function renewShareLink(listId: string): Promise<ShareLinkResponse> {
  return apiFetch<ShareLinkResponse>(`/shopping-lists/${encodeURIComponent(listId)}/share/renew`, { method: "POST" });
}

export function getSharedList(token: string): Promise<ShoppingListDetailResponse & { member_count?: number; owner_name?: string | null }> {
  return apiFetch<ShoppingListDetailResponse & { member_count?: number; owner_name?: string | null }>(`/shared/lists/${encodeURIComponent(token)}`);
}

// ── Votes / Hearts ──

export function heartRecipe(id: string): Promise<{ hearted: boolean; vote_count: number }> {
  return apiFetch<{ hearted: boolean; vote_count: number }>(
    `/recipes/${encodeURIComponent(id)}/heart`,
    { method: "POST" },
  );
}

export function unheartRecipe(id: string): Promise<{ hearted: boolean; vote_count: number }> {
  return apiFetch<{ hearted: boolean; vote_count: number }>(
    `/recipes/${encodeURIComponent(id)}/heart`,
    { method: "DELETE" },
  );
}

export function joinSharedList(token: string): Promise<{ success: boolean; list_id: string; list_name: string }> {
  return apiFetch<{ success: boolean; list_id: string; list_name: string }>(`/shared/lists/${encodeURIComponent(token)}/join`, {
    method: "POST",
  });
}

export function leaveSharedList(token: string): Promise<void> {
  return apiFetch<void>(`/shared/lists/${encodeURIComponent(token)}/leave`, { method: "DELETE" });
}

export function addSharedListItem(token: string, data: { name: string; quantity?: number; unit?: string }): Promise<ShoppingListItem> {
  return apiFetch<ShoppingListItem>(`/shared/lists/${encodeURIComponent(token)}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export interface SharedListMembership {
  is_member: boolean;
  is_owner: boolean;
  is_authenticated: boolean;
}

export function getSharedListMembership(token: string): Promise<SharedListMembership> {
  return apiFetch<SharedListMembership>(`/shared/lists/${encodeURIComponent(token)}/membership`);
}
