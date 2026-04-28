import type {
  RecipeDocument,
  RecipeSummary,
  Collection,
  Bookmark,
  BookmarkSyncAction,
  BookmarkSyncResult,
  ShoppingList,
  ShoppingListItem,
  ShoppingListItemSyncAction,
  ShoppingListItemSyncResult,
} from "@rr/shared";
import { buildQuery } from "@rr/shared/build-query";
import { useAuthStore } from "../stores/auth.store";

const BASE_URL = `${process.env.EXPO_PUBLIC_API_BASE || "https://reducedrecipes.com"}/api/v1`;

const USE_MOCK = false;

/** Structured API error with status code and message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().sessionToken;
  const authHeaders: Record<string, string> = {};
  if (token) authHeaders["Authorization"] = `Bearer ${token}`;
  console.log(`[API] ${init?.method ?? 'GET'} ${path} auth=${!!token}`);

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Client": "rr-mobile/1.0",
      ...authHeaders,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    console.error(`[API] FAIL ${res.status} ${path}:`, body?.error?.message);
    throw new ApiError(
      res.status,
      body?.error?.message ?? `API error ${res.status}: ${res.statusText}`,
    );
  }

  return res.json() as Promise<T>;
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

// ── Mock data for development ──────────────────────────────────────
const MOCK_RECIPES: RecipeSummary[] = [
  {
    id: "1",
    title: "Classic Margherita Pizza",
    domain: "seriouseats.com",
    image_url: "https://picsum.photos/seed/pizza/400/300",
    total_time: 45,
    cook_time: 15,
    yields: "4 servings",
    cuisine: "Italian",
    category: "Main",
    tags: ["pizza", "italian", "vegetarian"],
  },
  {
    id: "2",
    title: "Thai Green Curry",
    domain: "bonappetit.com",
    image_url: "https://picsum.photos/seed/curry/400/300",
    total_time: 35,
    cook_time: 20,
    yields: "4 servings",
    cuisine: "Thai",
    category: "Main",
    tags: ["curry", "thai", "spicy"],
  },
  {
    id: "3",
    title: "Avocado Toast with Poached Eggs",
    domain: "minimalistbaker.com",
    image_url: "https://picsum.photos/seed/avocado/400/300",
    total_time: 15,
    cook_time: 5,
    yields: "2 servings",
    cuisine: "American",
    category: "Breakfast",
    tags: ["breakfast", "quick", "healthy"],
  },
  {
    id: "4",
    title: "Chocolate Lava Cake",
    domain: "kingarthurbaking.com",
    image_url: "https://picsum.photos/seed/chocolate/400/300",
    total_time: 30,
    cook_time: 12,
    yields: "4 servings",
    cuisine: "French",
    category: "Dessert",
    tags: ["dessert", "chocolate", "baking"],
  },
  {
    id: "5",
    title: "Chicken Tikka Masala",
    domain: "budgetbytes.com",
    image_url: "https://picsum.photos/seed/tikka/400/300",
    total_time: 50,
    cook_time: 30,
    yields: "6 servings",
    cuisine: "Indian",
    category: "Main",
    tags: ["indian", "chicken", "curry"],
  },
  {
    id: "6",
    title: "Caesar Salad",
    domain: "foodnetwork.com",
    image_url: "https://picsum.photos/seed/caesar/400/300",
    total_time: 20,
    cook_time: 0,
    yields: "4 servings",
    cuisine: "American",
    category: "Salad",
    tags: ["salad", "quick", "classic"],
  },
  {
    id: "7",
    title: "Japanese Ramen",
    domain: "justonecookbook.com",
    image_url: "https://picsum.photos/seed/ramen/400/300",
    total_time: 120,
    cook_time: 90,
    yields: "4 servings",
    cuisine: "Japanese",
    category: "Soup",
    tags: ["japanese", "soup", "noodles"],
  },
  {
    id: "8",
    title: "Banana Bread",
    domain: "sallysbakingaddiction.com",
    image_url: "https://picsum.photos/seed/banana/400/300",
    total_time: 70,
    cook_time: 55,
    yields: "1 loaf",
    cuisine: "American",
    category: "Baking",
    tags: ["baking", "banana", "easy"],
  },
];

const MOCK_RECIPE_DOC: RecipeDocument = {
  id: "1",
  source_url: "https://seriouseats.com/margherita-pizza",
  domain: "seriouseats.com",
  title: "Classic Margherita Pizza",
  image_url: "https://picsum.photos/seed/pizza/400/300",
  author: "J. Kenji López-Alt",
  yields: "4 servings",
  prep_time: 30,
  cook_time: 15,
  total_time: 45,
  ingredients: [
    "500g bread flour",
    "325ml warm water",
    "7g instant yeast",
    "10g salt",
    "2 tbsp olive oil",
    "200g San Marzano tomatoes, crushed",
    "200g fresh mozzarella, sliced",
    "Fresh basil leaves",
  ],
  instructions: [
    "Mix flour, water, yeast, and salt. Knead for 10 minutes until smooth.",
    "Let dough rise for 1 hour until doubled.",
    "Preheat oven to 250°C (480°F) with pizza stone.",
    "Stretch dough into a 12-inch round on floured surface.",
    "Spread crushed tomatoes, add mozzarella slices.",
    "Bake for 10-12 minutes until crust is golden and cheese is bubbling.",
    "Top with fresh basil and drizzle with olive oil. Serve immediately.",
  ],
  tags: ["pizza", "italian", "vegetarian"],
  cuisine: "Italian",
  category: "Main",
  keywords: ["pizza", "margherita", "italian"],
  schema_valid: true,
  extracted_at: new Date().toISOString(),
  last_checked: new Date().toISOString(),
};

function mockDelay(ms = 300): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const mockApi = {
  recipes: {
    async list(params: RecipeListParams = {}): Promise<RecipeListResponse> {
      await mockDelay();
      let items = [...MOCK_RECIPES];
      if (params.max_time) items = items.filter((r) => (r.total_time ?? 999) <= params.max_time!);
      if (params.cuisine) items = items.filter((r) => r.cuisine?.toLowerCase() === params.cuisine!.toLowerCase());
      if (params.tag) items = items.filter((r) => r.tags?.includes(params.tag!));
      if (params.domain) items = items.filter((r) => r.domain === params.domain);
      const limit = params.limit ?? 10;
      return { items: items.slice(0, limit), next_cursor: null };
    },

    async get(id: string): Promise<RecipeDocument> {
      await mockDelay();
      const summary = MOCK_RECIPES.find((r) => r.id === id);
      if (!summary) throw new ApiError(404, "Recipe not found");
      return {
        ...MOCK_RECIPE_DOC,
        ...summary,
        source_url: `https://${summary.domain}/recipe`,
        ingredients: MOCK_RECIPE_DOC.ingredients,
        instructions: MOCK_RECIPE_DOC.instructions,
      };
    },

    async search(q: string, limit?: number): Promise<{ items: RecipeSummary[]; has_more: boolean }> {
      await mockDelay();
      const lower = q.toLowerCase();
      const results = MOCK_RECIPES.filter(
        (r) =>
          r.title.toLowerCase().includes(lower) ||
          r.tags?.some((t) => t.includes(lower)) ||
          r.cuisine?.toLowerCase().includes(lower),
      );
      const sliced = results.slice(0, limit ?? 10);
      return { items: sliced, has_more: sliced.length < results.length };
    },
  },

  tags: {
    async list(): Promise<{ tag: string; count: number }[]> {
      await mockDelay();
      const counts = new Map<string, number>();
      for (const r of MOCK_RECIPES) {
        for (const t of r.tags ?? []) {
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
      return Array.from(counts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);
    },
  },
};

// ── Exported API ───────────────────────────────────────────────────

const realApi = {
  recipes: {
    list(params: RecipeListParams = {}): Promise<RecipeListResponse> {
      return request<RecipeListResponse>(`/recipes${buildQuery({ ...params })}`);
    },

    get(id: string): Promise<RecipeDocument> {
      return request<RecipeDocument>(`/recipes/${encodeURIComponent(id)}`);
    },

    async search(q: string, limit?: number, offset?: number): Promise<{ items: RecipeSummary[]; has_more: boolean }> {
      const res = await request<{ items: RecipeSummary[]; has_more?: boolean } | RecipeSummary[]>(`/search${buildQuery({ q, limit, offset })}`);
      if (Array.isArray(res)) return { items: res, has_more: false };
      return { items: res.items, has_more: res.has_more ?? false };
    },
  },

  tags: {
    list(): Promise<{ tag: string; count: number }[]> {
      return request<{ tag: string; count: number }[]>("/tags");
    },
  },
};

// ── Phase 1b: Collections ─────────────────────────────────────────

export interface CollectionListResponse {
  items: Collection[];
}

export function fetchCollections(): Promise<CollectionListResponse> {
  return request<CollectionListResponse>("/collections");
}

export function createCollection(body: { name: string; is_public?: boolean }): Promise<Collection> {
  return request<Collection>("/collections", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateCollection(
  id: string,
  body: { name?: string; is_public?: boolean; position?: number },
): Promise<Collection> {
  return request<Collection>(`/collections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteCollection(id: string): Promise<void> {
  return request<void>(`/collections/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export interface CollectionBookmarksResponse {
  items: Bookmark[];
  next_cursor: string | null;
}

export function fetchCollectionBookmarks(
  id: string,
  cursor?: string,
  limit?: number,
): Promise<CollectionBookmarksResponse> {
  return request<CollectionBookmarksResponse>(
    `/collections/${encodeURIComponent(id)}/bookmarks${buildQuery({ cursor, limit })}`,
  );
}

// ── Phase 1b: Follow System ──────────────────────────────────────

export function followUser(userId: string): Promise<{ success: true }> {
  return request<{ success: true }>(`/users/${encodeURIComponent(userId)}/follow`, {
    method: "POST",
  });
}

export function unfollowUser(userId: string): Promise<void> {
  return request<void>(`/users/${encodeURIComponent(userId)}/follow`, {
    method: "DELETE",
  });
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

export function fetchFollowers(
  userId: string,
  cursor?: string,
  limit?: number,
): Promise<FollowListResponse> {
  return request<FollowListResponse>(
    `/users/${encodeURIComponent(userId)}/followers${buildQuery({ cursor, limit })}`,
  );
}

export function fetchFollowing(
  userId: string,
  cursor?: string,
  limit?: number,
): Promise<FollowListResponse> {
  return request<FollowListResponse>(
    `/users/${encodeURIComponent(userId)}/following${buildQuery({ cursor, limit })}`,
  );
}

export function fetchUserCollections(userId: string): Promise<CollectionListResponse> {
  return request<CollectionListResponse>(
    `/users/${encodeURIComponent(userId)}/collections`,
  );
}

// ── Phase 1b: Bookmark Extensions ────────────────────────────────

export function moveBookmark(
  bookmarkId: string,
  targetCollectionId: string,
): Promise<{ success: true }> {
  return request<{ success: true }>("/bookmarks/move", {
    method: "POST",
    body: JSON.stringify({
      bookmark_id: bookmarkId,
      target_collection_id: targetCollectionId,
    }),
  });
}

export interface BookmarkSearchResponse {
  items: (Bookmark & RecipeSummary)[];
}

export function searchBookmarks(
  query: string,
  collectionId?: string,
): Promise<BookmarkSearchResponse> {
  return request<BookmarkSearchResponse>(
    `/bookmarks/search${buildQuery({ q: query, collection_id: collectionId })}`,
  );
}

// ── Phase 1b: Offline Sync ───────────────────────────────────────

export interface SyncBookmarksResponse {
  results: BookmarkSyncResult[];
}

export function syncBookmarks(
  actions: BookmarkSyncAction[],
): Promise<SyncBookmarksResponse> {
  return request<SyncBookmarksResponse>("/sync/bookmarks", {
    method: "POST",
    body: JSON.stringify({ actions }),
  });
}

// ── Phase 2: Shopping Lists ──────────────────────────────────────

export interface ShoppingListsResponse {
  items: ShoppingList[];
}

export interface ShoppingListDetailResponse {
  list: ShoppingList;
  items: ShoppingListItem[];
}

/** Smart rollup item from the worker. */
interface SmartRollupSource {
  item_id: string;
  recipe_id: string | null;
  quantity: number | null;
  original_text: string | null;
}

interface SmartRollupItem {
  canonical_item: string;
  display_text: string;
  total_quantity: number | null;
  unit: string | null;
  category?: string;
  sources: SmartRollupSource[];
  parsing?: boolean;
}

/** Raw response shape from the worker (smart rollup format). */
interface ShoppingListDetailRawResponse extends ShoppingList {
  items: { unchecked: SmartRollupItem[]; checked: SmartRollupItem[] };
}

export function fetchShoppingLists(): Promise<ShoppingListsResponse> {
  return request<ShoppingListsResponse>("/shopping-lists");
}

export function createShoppingList(body: {
  name: string;
  collection_id?: string;
}): Promise<ShoppingList> {
  return request<ShoppingList>("/shopping-lists", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteShoppingList(id: string): Promise<void> {
  return request<void>(`/shopping-lists/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

function rollupToListItem(item: SmartRollupItem, checked: boolean): ShoppingListItem {
  const firstSource = item.sources[0];
  return {
    id: firstSource?.item_id ?? item.canonical_item,
    shopping_list_id: "",
    original_text: item.display_text,
    item: item.canonical_item,
    quantity: item.total_quantity,
    unit: item.unit,
    checked: checked ? 1 : 0,
    recipe_id: firstSource?.recipe_id ?? null,
    parsing: item.parsing ? 1 : 0,
    parse_failed: 0,
    source: "recipe" as const,
    position: 0,
    created_at: "",
    updated_at: "",
  };
}

export async function getShoppingList(
  id: string,
): Promise<ShoppingListDetailResponse> {
  const raw = await request<ShoppingListDetailRawResponse>(
    `/shopping-lists/${encodeURIComponent(id)}`,
  );
  const { items: rolledUp, ...listFields } = raw;
  const unchecked = rolledUp.unchecked.map((i) => rollupToListItem(i, false));
  const checked = rolledUp.checked.map((i) => rollupToListItem(i, true));
  return {
    list: listFields,
    items: [...unchecked, ...checked],
  };
}

export function addShoppingListItem(
  listId: string,
  body: { name: string; recipe_id?: string },
): Promise<ShoppingListItem> {
  return request<ShoppingListItem>(
    `/shopping-lists/${encodeURIComponent(listId)}/items`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function updateShoppingListItem(
  listId: string,
  itemId: string,
  body: { checked?: boolean; quantity?: number },
): Promise<ShoppingListItem> {
  // Convert checked boolean to 0/1 integer for the worker API
  const payload: { checked?: number; quantity?: number } = {};
  if (body.checked !== undefined) payload.checked = body.checked ? 1 : 0;
  if (body.quantity !== undefined) payload.quantity = body.quantity;

  return request<ShoppingListItem>(
    `/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export function deleteShoppingListItem(
  listId: string,
  itemId: string,
): Promise<void> {
  return request<void>(
    `/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
    },
  );
}

export function uncheckAllShoppingListItems(
  listId: string,
): Promise<void> {
  return request<void>(
    `/shopping-lists/${encodeURIComponent(listId)}/uncheck-all`,
    {
      method: "POST",
    },
  );
}

// ── Phase 2: Shopping List Offline Sync ─────────────────────────

/** Raw response from the worker sync endpoint. */
interface SyncShoppingListItemsRawResponse {
  applied: number;
  conflicts: ShoppingListItemSyncResult[];
}

export interface SyncShoppingListItemsResponse {
  results: ShoppingListItemSyncResult[];
}

export async function syncShoppingListItems(
  _shopping_list_id: string,
  actions: ShoppingListItemSyncAction[],
): Promise<SyncShoppingListItemsResponse> {
  const raw = await request<SyncShoppingListItemsRawResponse>("/sync/shopping-list-items", {
    method: "POST",
    body: JSON.stringify({ actions }),
  });
  // Normalize: worker returns { applied, conflicts } — convert to { results }
  // Build applied results from the actions that weren't in conflicts
  const conflictIds = new Set(raw.conflicts.map((c) => c.item_id));
  const applied: ShoppingListItemSyncResult[] = actions
    .filter((a) => !conflictIds.has(a.item_id))
    .map((a) => ({ item_id: a.item_id, status: 'applied' as const }));
  return { results: [...applied, ...raw.conflicts] };
}

// ── Shopping List Sharing ──────────────────────────────

export interface ShareShoppingListResponse {
  token: string;
  share_url: string;
}

export function shareShoppingList(
  listId: string,
): Promise<ShareShoppingListResponse> {
  return request<ShareShoppingListResponse>(
    `/shopping-lists/${encodeURIComponent(listId)}/share`,
    { method: "POST" },
  );
}

export interface JoinSharedListResponse {
  success: boolean;
  list_id: string;
  list_name: string;
}

export function joinSharedList(
  token: string,
): Promise<JoinSharedListResponse> {
  return request<JoinSharedListResponse>(
    `/shared/lists/${encodeURIComponent(token)}/join`,
    { method: "POST" },
  );
}

export function fetchSharedList(
  token: string,
): Promise<ShoppingListDetailResponse> {
  return request<ShoppingListDetailResponse>(
    `/shared/lists/${encodeURIComponent(token)}`,
  );
}

export const api = USE_MOCK ? mockApi : realApi;
