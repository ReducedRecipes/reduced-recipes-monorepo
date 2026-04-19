import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env } from '@rr/shared/env';
import type { ShoppingList, ShoppingListItem, IngredientParseJob } from '@rr/shared';
import { requireAuth } from '../middleware/auth';
import { parseIngredient } from '../helpers/ingredient-parser';
import { rollupItems } from '../helpers/smart-rollup';

type AuthEnv = { Bindings: Env; Variables: { userId: string } };

const shoppingLists = new Hono<AuthEnv>();

// Helper: verify list ownership, returns list or null
async function getOwnedList(db: D1Database, listId: string, userId: string) {
  return db
    .prepare('SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?')
    .bind(listId, userId)
    .first<ShoppingList>();
}

// GET /api/v1/shopping-lists — list all user's shopping lists
shoppingLists.get('/api/v1/shopping-lists', requireAuth, async (c) => {
  const userId = c.get('userId');

  const result = await c.env.USERS_DB!.prepare(
    `SELECT sl.id, sl.user_id, sl.name, sl.is_default, sl.collection_id,
            sl.share_token, sl.share_expires_at, sl.created_at, sl.updated_at,
            (SELECT COUNT(*) FROM shopping_list_items WHERE shopping_list_id = sl.id) AS item_count,
            (SELECT COUNT(DISTINCT recipe_id) FROM shopping_list_recipes WHERE shopping_list_id = sl.id) AS recipe_count
     FROM shopping_lists sl
     WHERE sl.user_id = ?
     ORDER BY sl.created_at DESC`,
  )
    .bind(userId)
    .all();

  const items = (result.results ?? []) as unknown as (ShoppingList & { item_count: number; recipe_count: number })[];

  return c.json({ items });
});

// POST /api/v1/shopping-lists — create a new shopping list
shoppingLists.post('/api/v1/shopping-lists', requireAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ name?: string }>();

  const name = (body.name ?? 'My Shopping List').trim();

  // Check if user has any lists — first list gets is_default=1
  const existing = await c.env.USERS_DB!.prepare(
    'SELECT COUNT(*) as count FROM shopping_lists WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ count: number }>();

  const isDefault = (existing?.count ?? 0) === 0 ? 1 : 0;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.USERS_DB!.prepare(
    `INSERT INTO shopping_lists (id, user_id, name, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, name, isDefault, now, now)
    .run();

  const list: ShoppingList = {
    id,
    user_id: userId,
    collection_id: null,
    name,
    is_default: isDefault,
    share_token: null,
    share_expires_at: null,
    created_at: now,
    updated_at: now,
  };

  return c.json(list, 201);
});

// GET /api/v1/shopping-lists/:id — get a single list with items (smart rollup applied)
shoppingLists.get('/api/v1/shopping-lists/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');

  const list = await getOwnedList(c.env.USERS_DB!, listId, userId);

  if (!list) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Shopping list not found' } },
      404,
    );
  }

  // Fetch items
  const itemsResult = await c.env.USERS_DB!.prepare(
    'SELECT * FROM shopping_list_items WHERE shopping_list_id = ? ORDER BY created_at ASC',
  )
    .bind(listId)
    .all();

  const items = itemsResult.results ?? [];

  // Apply smart rollup — deduplicates and aggregates quantities
  const typedItems = items as unknown as ShoppingListItem[];
  const rolledUp = rollupItems(typedItems);

  return c.json({ ...list, items: rolledUp.items });
});

// PATCH /api/v1/shopping-lists/:id — update list name
shoppingLists.patch('/api/v1/shopping-lists/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');
  const body = await c.req.json<{ name?: string }>();

  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'name is required and cannot be empty' } },
      400,
    );
  }

  const list = await getOwnedList(c.env.USERS_DB!, listId, userId);

  if (!list) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Shopping list not found' } },
      404,
    );
  }

  const now = new Date().toISOString();
  await c.env.USERS_DB!.prepare(
    'UPDATE shopping_lists SET name = ?, updated_at = ? WHERE id = ?',
  )
    .bind(body.name.trim(), now, listId)
    .run();

  return c.json({ ...list, name: body.name.trim(), updated_at: now });
});

// DELETE /api/v1/shopping-lists/:id — delete a non-default list
shoppingLists.delete('/api/v1/shopping-lists/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');

  const list = await getOwnedList(c.env.USERS_DB!, listId, userId);

  if (!list) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Shopping list not found' } },
      404,
    );
  }

  // If deleting the default list, promote the next oldest list
  if (list.is_default) {
    const nextList = await c.env.USERS_DB!.prepare(
      'SELECT id FROM shopping_lists WHERE user_id = ? AND id != ? ORDER BY created_at ASC LIMIT 1',
    )
      .bind(userId, listId)
      .first<{ id: string }>();

    if (nextList) {
      await c.env.USERS_DB!.prepare(
        'UPDATE shopping_lists SET is_default = 1 WHERE id = ?',
      )
        .bind(nextList.id)
        .run();
    }
  }

  await c.env.USERS_DB!.prepare('DELETE FROM shopping_lists WHERE id = ?')
    .bind(listId)
    .run();

  return c.body(null, 204);
});

// ── S-8: Recipe and item management routes ──────────────────────────────

// POST /api/v1/shopping-lists/:id/recipes — add recipe ingredients to list
shoppingLists.post('/api/v1/shopping-lists/:id/recipes', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');

  const list = await getOwnedList(c.env.USERS_DB!, listId, userId);
  if (!list) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Shopping list not found' } }, 404);
  }

  const body = await c.req.json<{ recipe_id: string; ingredients: string[] }>();
  if (!body.recipe_id || !Array.isArray(body.ingredients) || body.ingredients.length === 0) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'recipe_id and non-empty ingredients array are required' } }, 400);
  }

  const now = new Date().toISOString();
  const items: { id: string; original_text: string }[] = [];

  // Insert recipe junction
  await c.env.USERS_DB!.prepare(
    'INSERT INTO shopping_list_recipes (shopping_list_id, recipe_id, added_at) VALUES (?, ?, ?)',
  )
    .bind(listId, body.recipe_id, now)
    .run();

  // Insert items with parsing=1
  for (const raw of body.ingredients) {
    const id = crypto.randomUUID();
    items.push({ id, original_text: raw });

    await c.env.USERS_DB!.prepare(
      `INSERT INTO shopping_list_items (id, shopping_list_id, recipe_id, original_text, quantity, unit, item, checked, parse_failed, parsing, source, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, 0, 0, 1, 'recipe', 0, ?, ?)`,
    )
      .bind(id, listId, body.recipe_id, raw, now, now)
      .run();
  }

  // Send parse job to queue
  if (c.env.INGREDIENT_PARSE_QUEUE) {
    const job: IngredientParseJob = {
      shopping_list_id: listId,
      recipe_id: body.recipe_id,
      items,
    };
    await c.env.INGREDIENT_PARSE_QUEUE.send(job);
  }

  return c.json({ items }, 201);
});

// DELETE /api/v1/shopping-lists/:id/recipes/:recipe_id — remove recipe and its items
shoppingLists.delete('/api/v1/shopping-lists/:id/recipes/:recipe_id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');
  const recipeId = c.req.param('recipe_id');

  const list = await getOwnedList(c.env.USERS_DB!, listId, userId);
  if (!list) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Shopping list not found' } }, 404);
  }

  // Delete associated items first, then recipe junction
  await c.env.USERS_DB!.prepare(
    'DELETE FROM shopping_list_items WHERE shopping_list_id = ? AND recipe_id = ?',
  )
    .bind(listId, recipeId)
    .run();

  await c.env.USERS_DB!.prepare(
    'DELETE FROM shopping_list_recipes WHERE shopping_list_id = ? AND recipe_id = ?',
  )
    .bind(listId, recipeId)
    .run();

  return c.body(null, 204);
});

// POST /api/v1/shopping-lists/:id/items — add manual item
shoppingLists.post('/api/v1/shopping-lists/:id/items', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');

  const list = await getOwnedList(c.env.USERS_DB!, listId, userId);
  if (!list) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Shopping list not found' } }, 404);
  }

  const body = await c.req.json<{ name: string; quantity?: number; unit?: string }>();
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'name is required' } }, 400);
  }

  const parsed = parseIngredient(body.name);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const item: ShoppingListItem = {
    id,
    shopping_list_id: listId,
    recipe_id: null,
    original_text: body.name.trim(),
    quantity: body.quantity ?? parsed.quantity,
    unit: body.unit ?? (parsed.unit || null),
    item: parsed.canonical_name || body.name.trim().toLowerCase(),
    checked: 0,
    parse_failed: 0,
    parsing: 0,
    source: 'manual',
    position: 0,
    created_at: now,
    updated_at: now,
  };

  await c.env.USERS_DB!.prepare(
    `INSERT INTO shopping_list_items (id, shopping_list_id, recipe_id, original_text, quantity, unit, item, checked, parse_failed, parsing, source, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'manual', 0, ?, ?)`,
  )
    .bind(id, listId, null, item.original_text, item.quantity, item.unit, item.item, now, now)
    .run();

  return c.json(item, 201);
});

// PATCH /api/v1/shopping-lists/:id/items/:item_id — update item fields
shoppingLists.patch('/api/v1/shopping-lists/:id/items/:item_id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');
  const itemId = c.req.param('item_id');

  const list = await getOwnedList(c.env.USERS_DB!, listId, userId);
  if (!list) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Shopping list not found' } }, 404);
  }

  const existing = await c.env.USERS_DB!.prepare(
    'SELECT * FROM shopping_list_items WHERE id = ? AND shopping_list_id = ?',
  )
    .bind(itemId, listId)
    .first<ShoppingListItem>();

  if (!existing) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Item not found' } }, 404);
  }

  const body = await c.req.json<{ checked?: number; quantity?: number; unit?: string; name?: string }>();
  const now = new Date().toISOString();

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.checked !== undefined) { updates.push('checked = ?'); values.push(body.checked); }
  if (body.quantity !== undefined) { updates.push('quantity = ?'); values.push(body.quantity); }
  if (body.unit !== undefined) { updates.push('unit = ?'); values.push(body.unit); }
  if (body.name !== undefined) { updates.push('item = ?'); values.push(body.name); updates.push('original_text = ?'); values.push(body.name); }

  if (updates.length === 0) {
    return c.json(existing);
  }

  updates.push('updated_at = ?');
  values.push(now);
  values.push(itemId, listId);

  await c.env.USERS_DB!.prepare(
    `UPDATE shopping_list_items SET ${updates.join(', ')} WHERE id = ? AND shopping_list_id = ?`,
  )
    .bind(...values)
    .run();

  const updated = {
    ...existing,
    ...(body.checked !== undefined ? { checked: body.checked } : {}),
    ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
    ...(body.unit !== undefined ? { unit: body.unit } : {}),
    ...(body.name !== undefined ? { item: body.name, original_text: body.name } : {}),
    updated_at: now,
  };

  return c.json(updated);
});

// DELETE /api/v1/shopping-lists/:id/items/:item_id — remove item
shoppingLists.delete('/api/v1/shopping-lists/:id/items/:item_id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');
  const itemId = c.req.param('item_id');

  const list = await getOwnedList(c.env.USERS_DB!, listId, userId);
  if (!list) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Shopping list not found' } }, 404);
  }

  const existing = await c.env.USERS_DB!.prepare(
    'SELECT id FROM shopping_list_items WHERE id = ? AND shopping_list_id = ?',
  )
    .bind(itemId, listId)
    .first();

  if (!existing) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Item not found' } }, 404);
  }

  await c.env.USERS_DB!.prepare(
    'DELETE FROM shopping_list_items WHERE id = ? AND shopping_list_id = ?',
  )
    .bind(itemId, listId)
    .run();

  return c.body(null, 204);
});

// ── S-9: Share routes ────────────────────────────────────────────────────

const SHARE_TOKEN_EXPIRY_DAYS = 7;

/** Validate a share token against a specific list. Exported for use by DO (S-11). */
export async function validateShareToken(db: D1Database, listId: string, token: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT share_token, share_expires_at FROM shopping_lists WHERE id = ? AND share_token = ?')
    .bind(listId, token)
    .first<{ share_token: string; share_expires_at: string }>();

  if (!row) return false;
  if (new Date(row.share_expires_at) < new Date()) return false;
  return true;
}

// POST /api/v1/shopping-lists/:id/share — generate share token (owner only)
shoppingLists.post('/api/v1/shopping-lists/:id/share', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');

  const list = await getOwnedList(c.env.USERS_DB!, listId, userId);
  if (!list) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Shopping list not found' } }, 404);
  }

  const shareToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SHARE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  await c.env.USERS_DB!.prepare(
    'UPDATE shopping_lists SET share_token = ?, share_expires_at = ?, updated_at = ? WHERE id = ?',
  )
    .bind(shareToken, expiresAt, now, listId)
    .run();

  return c.json({
    share_token: shareToken,
    expires_at: expiresAt,
    share_url: `/shared/lists/${shareToken}`,
  });
});

// POST /api/v1/shopping-lists/:id/share/renew — extend share token expiry (owner only)
shoppingLists.post('/api/v1/shopping-lists/:id/share/renew', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');

  const list = await getOwnedList(c.env.USERS_DB!, listId, userId);
  if (!list) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Shopping list not found' } }, 404);
  }

  if (!list.share_token) {
    return c.json({ error: { code: 'NO_SHARE_TOKEN', message: 'No share token to renew' } }, 400);
  }

  const expiresAt = new Date(Date.now() + SHARE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  await c.env.USERS_DB!.prepare(
    'UPDATE shopping_lists SET share_expires_at = ?, updated_at = ? WHERE id = ?',
  )
    .bind(expiresAt, now, listId)
    .run();

  return c.json({ share_token: list.share_token, expires_at: expiresAt });
});

// DELETE /api/v1/shopping-lists/:id/share — revoke share token (owner only)
shoppingLists.delete('/api/v1/shopping-lists/:id/share', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');

  const list = await getOwnedList(c.env.USERS_DB!, listId, userId);
  if (!list) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Shopping list not found' } }, 404);
  }

  const now = new Date().toISOString();
  await c.env.USERS_DB!.prepare(
    'UPDATE shopping_lists SET share_token = NULL, share_expires_at = NULL, updated_at = ? WHERE id = ?',
  )
    .bind(now, listId)
    .run();

  return c.body(null, 204);
});

// GET /api/v1/shared/lists/:token — public shared list access (no auth required)
shoppingLists.get('/api/v1/shared/lists/:token', async (c) => {
  const token = c.req.param('token');

  const list = await c.env.USERS_DB!.prepare(
    'SELECT * FROM shopping_lists WHERE share_token = ?',
  )
    .bind(token)
    .first<ShoppingList>();

  if (!list) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Shared list not found' } }, 404);
  }

  if (list.share_expires_at && new Date(list.share_expires_at) < new Date()) {
    return c.json({ error: { code: 'EXPIRED', message: 'Share link has expired' } }, 410);
  }

  // Fetch items and apply rollup
  const itemsResult = await c.env.USERS_DB!.prepare(
    'SELECT * FROM shopping_list_items WHERE shopping_list_id = ? ORDER BY created_at ASC',
  )
    .bind(list.id)
    .all();

  const items = itemsResult.results ?? [];
  const typedItems = items as unknown as ShoppingListItem[];
  const rolledUp = rollupItems(typedItems);

  return c.json({ ...list, items: rolledUp.items });
});

// POST /api/v1/shopping-lists/:id/uncheck-all — uncheck all items in list
shoppingLists.post('/api/v1/shopping-lists/:id/uncheck-all', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');

  const list = await getOwnedList(c.env.USERS_DB!, listId, userId);
  if (!list) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Shopping list not found' } }, 404);
  }

  const now = new Date().toISOString();
  const result = await c.env.USERS_DB!.prepare(
    'UPDATE shopping_list_items SET checked = 0, updated_at = ? WHERE shopping_list_id = ? AND checked = 1',
  )
    .bind(now, listId)
    .run();

  return c.json({ count: result.meta?.changes ?? 0 });
});

// ── S-11: WebSocket upgrade route for real-time collaboration ─────────

// GET /api/v1/shopping-lists/:id/ws — WebSocket upgrade to ShoppingListDO
shoppingLists.get('/api/v1/shopping-lists/:id/ws', async (c) => {
  const listId = c.req.param('id');
  const upgradeHeader = c.req.header('Upgrade');

  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return c.json(
      { error: { code: 'UPGRADE_REQUIRED', message: 'WebSocket upgrade required' } },
      426,
    );
  }

  // Auth: check session cookie/bearer token OR share_token query param
  const shareToken = c.req.query('share_token');
  let userId: string | null = null;

  // Try session auth first (cookie then Bearer header)
  const sessionToken =
    c.req.header('Authorization')?.replace('Bearer ', '') ??
    getCookie(c, 'session');

  if (sessionToken) {
    const sessionData = await c.env.SESSION_KV?.get(sessionToken);
    if (sessionData) {
      const session = JSON.parse(sessionData) as { userId?: string; user_id?: string };
      userId = session.userId ?? session.user_id ?? null;

      if (userId) {
        // Verify list ownership
        const list = await c.env.USERS_DB!.prepare(
          'SELECT id FROM shopping_lists WHERE id = ? AND user_id = ?',
        )
          .bind(listId, userId)
          .first();

        if (!list) {
          return c.json(
            { error: { code: 'NOT_FOUND', message: 'Shopping list not found' } },
            404,
          );
        }
      }
    }
  }

  // If no valid session, try share token
  if (!userId && shareToken) {
    const valid = await validateShareToken(c.env.USERS_DB!, listId, shareToken);
    if (!valid) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Invalid or expired share token' } },
        403,
      );
    }
  } else if (!userId) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      401,
    );
  }

  // Get DO stub and forward the upgrade request
  const doId = c.env.SHOPPING_LIST_DO!.idFromName(listId);
  const stub = c.env.SHOPPING_LIST_DO!.get(doId);

  // Build the forwarded URL with list_id param for the DO
  const url = new URL(c.req.url);
  url.searchParams.set('list_id', listId);
  if (shareToken) {
    url.searchParams.set('share_token', shareToken);
  }

  // Forward with auth info in headers
  const headers = new Headers(c.req.raw.headers);
  if (userId) {
    headers.set('X-User-Id', userId);
  }

  const doRequest = new Request(url.toString(), {
    headers,
  });

  return stub.fetch(doRequest);
});

export default shoppingLists;
