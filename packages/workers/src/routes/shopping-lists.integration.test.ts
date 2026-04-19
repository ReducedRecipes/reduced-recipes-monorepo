// @vitest-environment node

/**
 * Shopping list happy-path integration test (BF-4).
 *
 * Covers the full lifecycle with in-memory D1 mock that tracks state:
 *   create list → add manual item → add recipe items → check off items
 *   → view list (rollup) → uncheck all → delete item
 */
import { describe, it, expect, vi } from 'vitest';
import shoppingLists from './shopping-lists';
import type { Env } from '@rr/shared/env';
import type { ShoppingList, ShoppingListItem, SmartRollupItem, User } from '@rr/shared';

// ── Test fixtures ──────────────────────────────────────────────────────

const TEST_USER: User = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  picture_url: null,
  profile_public: 1,
  tier: 'free',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid-token',
  'Content-Type': 'application/json',
};

// ── In-memory stateful D1 mock ─────────────────────────────────────────

function createStatefulDB() {
  const lists = new Map<string, Record<string, unknown>>();
  const items = new Map<string, Record<string, unknown>>();
  const recipeJunctions = new Map<string, { shopping_list_id: string; recipe_id: string }>();

  return {
    _lists: lists,
    _items: items,
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => ({
        first: vi.fn(async () => {
          // Auth: SELECT * FROM users
          if (sql.includes('SELECT * FROM users')) {
            return TEST_USER;
          }
          // COUNT existing lists
          if (sql.includes('COUNT(*)') && sql.includes('shopping_lists')) {
            let count = 0;
            for (const l of lists.values()) {
              if (l.user_id === params[0]) count++;
            }
            return { count };
          }
          // SELECT single shopping list by id and user_id
          if (sql.includes('FROM shopping_lists') && sql.includes('WHERE id = ?') && sql.includes('user_id')) {
            const listId = params[0] as string;
            const userId = params[1] as string;
            const list = lists.get(listId);
            if (list && list.user_id === userId) return list;
            return null;
          }
          // SELECT single shopping list by share_token
          if (sql.includes('FROM shopping_lists') && sql.includes('share_token = ?') && !sql.includes('user_id')) {
            for (const l of lists.values()) {
              if (l.share_token === params[0]) return l;
            }
            return null;
          }
          // SELECT single item by id and shopping_list_id
          if (sql.includes('FROM shopping_list_items') && sql.includes('WHERE id = ?')) {
            const itemId = params[0] as string;
            const listId = params[1] as string;
            const item = items.get(itemId);
            if (item && item.shopping_list_id === listId) return item;
            return null;
          }
          return null;
        }),
        all: vi.fn(async () => {
          // SELECT all lists for user
          if (sql.includes('FROM shopping_lists sl') && sql.includes('ORDER BY')) {
            const userId = params[0] as string;
            const userLists = [...lists.values()]
              .filter((l) => l.user_id === userId)
              .map((l) => ({
                ...l,
                item_count: [...items.values()].filter(
                  (i) => i.shopping_list_id === l.id,
                ).length,
                recipe_count: [...recipeJunctions.values()].filter(
                  (r) => r.shopping_list_id === l.id,
                ).length,
              }));
            return { results: userLists, success: true };
          }
          // SELECT items for a list
          if (sql.includes('FROM shopping_list_items') && sql.includes('WHERE shopping_list_id')) {
            const listId = params[0] as string;
            const listItems = [...items.values()]
              .filter((i) => i.shopping_list_id === listId)
              .sort((a, b) => (a.created_at as string).localeCompare(b.created_at as string));
            return { results: listItems, success: true };
          }
          return { results: [], success: true };
        }),
        run: vi.fn(async () => {
          // INSERT shopping list
          if (sql.includes('INSERT INTO shopping_lists')) {
            const [id, userId, name, isDefault, createdAt, updatedAt] = params as string[];
            lists.set(id!, {
              id,
              user_id: userId,
              name,
              is_default: Number(isDefault),
              collection_id: null,
              share_token: null,
              share_expires_at: null,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { success: true };
          }
          // INSERT shopping_list_recipes
          if (sql.includes('INSERT INTO shopping_list_recipes')) {
            const [listId, recipeId] = params as string[];
            recipeJunctions.set(`${listId!}:${recipeId!}`, {
              shopping_list_id: listId!,
              recipe_id: recipeId!,
            });
            return { success: true };
          }
          // INSERT shopping_list_items
          if (sql.includes('INSERT INTO shopping_list_items')) {
            const isManual = sql.includes("'manual'");
            if (isManual) {
              // Manual: .bind(id, listId, null, originalText, quantity, unit, item, now, now)
              const [id, listId, recipeId, originalText, quantity, unit, item, createdAt, updatedAt] = params as (string | null)[];
              items.set(id!, {
                id, shopping_list_id: listId, recipe_id: recipeId,
                original_text: originalText,
                quantity: quantity != null ? Number(quantity) : null,
                unit: unit || null, item: item || null,
                canonical_name: item ? item.toLowerCase().trim() : null,
                category: 'Other',
                checked: 0, parse_failed: 0, parsing: 0,
                source: 'manual', position: 0,
                created_at: createdAt, updated_at: updatedAt,
              });
            } else {
              // Recipe: .bind(id, listId, recipeId, raw, now, now)
              const [id, listId, recipeId, originalText, createdAt, updatedAt] = params as string[];
              items.set(id!, {
                id, shopping_list_id: listId, recipe_id: recipeId,
                original_text: originalText,
                quantity: null, unit: null, item: null,
                canonical_name: null,
                category: null,
                checked: 0, parse_failed: 0, parsing: 1,
                source: 'recipe', position: 0,
                created_at: createdAt, updated_at: updatedAt,
              });
            }
            return { success: true };
          }
          // UPDATE shopping_list_items (check/uncheck or field updates)
          if (sql.includes('UPDATE shopping_list_items SET checked = 0') && sql.includes('shopping_list_id')) {
            // uncheck-all
            const listId = params[1] as string;
            let changes = 0;
            for (const item of items.values()) {
              if (item.shopping_list_id === listId && item.checked === 1) {
                item.checked = 0;
                item.updated_at = params[0] as string;
                changes++;
              }
            }
            return { success: true, meta: { changes } };
          }
          if (sql.includes('UPDATE shopping_list_items')) {
            // Generic item update — parse the SET clause to apply changes
            const itemId = params[params.length - 2] as string;
            const existing = items.get(itemId);
            if (existing) {
              // Extract update fields from params in order of SET clause
              let idx = 0;
              if (sql.includes('checked = ?')) { existing.checked = params[idx] as number; idx++; }
              if (sql.includes('quantity = ?')) { existing.quantity = params[idx] as number; idx++; }
              if (sql.includes('unit = ?')) { existing.unit = params[idx] as string; idx++; }
              if (sql.includes('item = ?')) { existing.item = params[idx] as string; idx++; }
              if (sql.includes('original_text = ?')) { existing.original_text = params[idx] as string; idx++; }
              // updated_at is always last SET field
              existing.updated_at = params[idx] as string;
            }
            return { success: true };
          }
          // DELETE item
          if (sql.includes('DELETE FROM shopping_list_items') && sql.includes('id = ?')) {
            const itemId = params[0] as string;
            items.delete(itemId);
            return { success: true };
          }
          // DELETE recipe items
          if (sql.includes('DELETE FROM shopping_list_items') && sql.includes('recipe_id')) {
            const listId = params[0] as string;
            const recipeId = params[1] as string;
            for (const [k, v] of items) {
              if (v.shopping_list_id === listId && v.recipe_id === recipeId) items.delete(k);
            }
            return { success: true };
          }
          // DELETE recipe junction
          if (sql.includes('DELETE FROM shopping_list_recipes')) {
            const key = `${params[0]}:${params[1]}`;
            recipeJunctions.delete(key);
            return { success: true };
          }
          // DELETE shopping list
          if (sql.includes('DELETE FROM shopping_lists')) {
            lists.delete(params[0] as string);
            return { success: true };
          }
          // UPDATE shopping list (name, share token, etc.)
          if (sql.includes('UPDATE shopping_lists')) {
            const listId = params[params.length - 1] as string;
            const list = lists.get(listId);
            if (list) {
              if (sql.includes('name = ?')) list.name = params[0] as string;
              if (sql.includes('share_token = ?') && sql.includes('share_expires_at = ?')) {
                list.share_token = params[0];
                list.share_expires_at = params[1];
              }
              if (sql.includes('share_token = NULL')) {
                list.share_token = null;
                list.share_expires_at = null;
              }
            }
            return { success: true };
          }
          return { success: true, meta: { changes: 0 } };
        }),
      })),
    })),
  } as unknown as D1Database;
}

function makeEnv(usersDB: D1Database): Env {
  const kvStore = new Map<string, string>();
  kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

  return {
    DB: {} as D1Database,
    RECIPES_KV: {} as KVNamespace,
    CACHE_KV: {} as KVNamespace,
    IMAGES_R2: {} as R2Bucket,
    CRAWL_QUEUE: {} as Queue,
    PARSE_QUEUE: {} as Queue,
    PROJECTION_QUEUE: {} as Queue,
    ADMIN_TOKEN: 'admin',
    BOT_USER_AGENT: 'bot',
    DEFAULT_CRAWL_DELAY_MS: '100',
    MAX_QUEUE_BATCH: '10',
    ENVIRONMENT: 'test',
    USERS_DB: usersDB,
    SESSION_KV: {
      get: vi.fn(async (key: string) => kvStore.get(key) ?? null),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      getWithMetadata: vi.fn(),
    } as unknown as KVNamespace,
    INGREDIENT_PARSE_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
  } as Env;
}

// ── Happy-path integration test ────────────────────────────────────────

describe('Shopping list happy-path e2e', () => {
  it('create list → add items → check off → view rollup → uncheck all → delete item', async () => {
    const db = createStatefulDB();
    const env = makeEnv(db);

    // 1. Create a shopping list
    const createRes = await shoppingLists.request(
      '/api/v1/shopping-lists',
      { method: 'POST', headers: AUTH_HEADERS, body: JSON.stringify({ name: 'Weekly Groceries' }) },
      env,
    );
    expect(createRes.status).toBe(201);
    const list = (await createRes.json()) as ShoppingList;
    expect(list.name).toBe('Weekly Groceries');
    expect(list.is_default).toBe(1);
    const listId = list.id;

    // 2. Add a manual item
    const addManualRes = await shoppingLists.request(
      `/api/v1/shopping-lists/${listId}/items`,
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ name: '2 cups milk' }),
      },
      env,
    );
    expect(addManualRes.status).toBe(201);
    const manualItem = (await addManualRes.json()) as ShoppingListItem;
    expect(manualItem.source).toBe('manual');
    expect(manualItem.original_text).toBe('2 cups milk');
    expect(manualItem.checked).toBe(0);

    // 3. Add recipe ingredients
    const addRecipeRes = await shoppingLists.request(
      `/api/v1/shopping-lists/${listId}/recipes`,
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          recipe_id: 'recipe-1',
          ingredients: ['200g pasta', '100ml tomato sauce'],
        }),
      },
      env,
    );
    expect(addRecipeRes.status).toBe(201);
    const recipeItems = (await addRecipeRes.json()) as { items: { id: string }[] };
    expect(recipeItems.items).toHaveLength(2);

    // 4. View list — should show 3 unchecked rolled-up items
    const viewRes1 = await shoppingLists.request(
      `/api/v1/shopping-lists/${listId}`,
      { headers: AUTH_HEADERS },
      env,
    );
    expect(viewRes1.status).toBe(200);
    const view1 = (await viewRes1.json()) as {
      name: string;
      items: { unchecked: SmartRollupItem[]; checked: SmartRollupItem[] };
    };
    expect(view1.name).toBe('Weekly Groceries');
    expect(view1.items.unchecked).toHaveLength(3);
    expect(view1.items.checked).toHaveLength(0);

    // Verify rollup shape: each item has canonical_item, display_text, category, sources
    const firstItem = view1.items.unchecked[0]!;
    expect(firstItem).toHaveProperty('canonical_item');
    expect(firstItem).toHaveProperty('display_text');
    expect(firstItem).toHaveProperty('category');
    expect(firstItem).toHaveProperty('sources');
    expect(Array.isArray(firstItem.sources)).toBe(true);
    expect(firstItem.sources.length).toBeGreaterThanOrEqual(1);

    // 5. Check off the manual item
    const checkRes = await shoppingLists.request(
      `/api/v1/shopping-lists/${listId}/items/${manualItem.id}`,
      {
        method: 'PATCH',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ checked: 1 }),
      },
      env,
    );
    expect(checkRes.status).toBe(200);
    const checkedItem = (await checkRes.json()) as ShoppingListItem;
    expect(checkedItem.checked).toBe(1);

    // 6. View list — should show 2 unchecked, 1 checked
    const viewRes2 = await shoppingLists.request(
      `/api/v1/shopping-lists/${listId}`,
      { headers: AUTH_HEADERS },
      env,
    );
    expect(viewRes2.status).toBe(200);
    const view2 = (await viewRes2.json()) as {
      items: { unchecked: SmartRollupItem[]; checked: SmartRollupItem[] };
    };
    expect(view2.items.unchecked).toHaveLength(2);
    expect(view2.items.checked).toHaveLength(1);

    // 7. Uncheck all
    const uncheckRes = await shoppingLists.request(
      `/api/v1/shopping-lists/${listId}/uncheck-all`,
      { method: 'POST', headers: AUTH_HEADERS },
      env,
    );
    expect(uncheckRes.status).toBe(200);
    const uncheckData = (await uncheckRes.json()) as { count: number };
    expect(uncheckData.count).toBe(1);

    // 8. View list — all 3 should be unchecked again
    const viewRes3 = await shoppingLists.request(
      `/api/v1/shopping-lists/${listId}`,
      { headers: AUTH_HEADERS },
      env,
    );
    expect(viewRes3.status).toBe(200);
    const view3 = (await viewRes3.json()) as {
      items: { unchecked: SmartRollupItem[]; checked: SmartRollupItem[] };
    };
    expect(view3.items.unchecked).toHaveLength(3);
    expect(view3.items.checked).toHaveLength(0);

    // 9. Delete the manual item
    const deleteItemRes = await shoppingLists.request(
      `/api/v1/shopping-lists/${listId}/items/${manualItem.id}`,
      { method: 'DELETE', headers: AUTH_HEADERS },
      env,
    );
    expect(deleteItemRes.status).toBe(204);

    // 10. View list — only 2 recipe items remain
    const viewRes4 = await shoppingLists.request(
      `/api/v1/shopping-lists/${listId}`,
      { headers: AUTH_HEADERS },
      env,
    );
    expect(viewRes4.status).toBe(200);
    const view4 = (await viewRes4.json()) as {
      items: { unchecked: SmartRollupItem[]; checked: SmartRollupItem[] };
    };
    expect(view4.items.unchecked).toHaveLength(2);

    // 11. Verify list appears in GET /shopping-lists
    const listAllRes = await shoppingLists.request(
      '/api/v1/shopping-lists',
      { headers: AUTH_HEADERS },
      env,
    );
    expect(listAllRes.status).toBe(200);
    const allLists = (await listAllRes.json()) as { items: Record<string, unknown>[] };
    expect(allLists.items).toHaveLength(1);
    expect(allLists.items[0]!.name).toBe('Weekly Groceries');
  });

  it('share flow: generate token → view shared list → revoke', async () => {
    const db = createStatefulDB();
    const env = makeEnv(db);

    // Create a list
    const createRes = await shoppingLists.request(
      '/api/v1/shopping-lists',
      { method: 'POST', headers: AUTH_HEADERS, body: JSON.stringify({ name: 'Shared List' }) },
      env,
    );
    const list = (await createRes.json()) as ShoppingList;

    // Add a manual item
    await shoppingLists.request(
      `/api/v1/shopping-lists/${list.id}/items`,
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ name: 'eggs' }),
      },
      env,
    );

    // Generate share token
    const shareRes = await shoppingLists.request(
      `/api/v1/shopping-lists/${list.id}/share`,
      { method: 'POST', headers: AUTH_HEADERS },
      env,
    );
    expect(shareRes.status).toBe(200);
    const shareData = (await shareRes.json()) as { share_token: string; expires_at: string; share_url: string };
    expect(shareData.share_token).toBeTruthy();
    expect(shareData.share_url).toContain(shareData.share_token);

    // View shared list (no auth required)
    const sharedViewRes = await shoppingLists.request(
      `/api/v1/shared/lists/${shareData.share_token}`,
      {},
      env,
    );
    expect(sharedViewRes.status).toBe(200);
    const sharedView = (await sharedViewRes.json()) as {
      name: string;
      items: { unchecked: SmartRollupItem[]; checked: SmartRollupItem[] };
    };
    expect(sharedView.name).toBe('Shared List');
    expect(sharedView.items.unchecked).toHaveLength(1);

    // Verify shared list also returns rollup shape
    const sharedItem = sharedView.items.unchecked[0]!;
    expect(sharedItem).toHaveProperty('canonical_item');
    expect(sharedItem).toHaveProperty('display_text');
    expect(sharedItem).toHaveProperty('category');

    // Revoke share token
    const revokeRes = await shoppingLists.request(
      `/api/v1/shopping-lists/${list.id}/share`,
      { method: 'DELETE', headers: AUTH_HEADERS },
      env,
    );
    expect(revokeRes.status).toBe(204);

    // Shared list should no longer be accessible
    const sharedViewAfterRevoke = await shoppingLists.request(
      `/api/v1/shared/lists/${shareData.share_token}`,
      {},
      env,
    );
    expect(sharedViewAfterRevoke.status).toBe(404);
  });
});
