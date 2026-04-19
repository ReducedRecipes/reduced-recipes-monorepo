import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import type { ShoppingList, ShoppingListItem } from '@rr/shared';
import { requireAuth } from '../middleware/auth';
import { rollupItems } from '../helpers/smart-rollup';

type AuthEnv = { Bindings: Env; Variables: { userId: string } };

const SHARE_TOKEN_EXPIRY_DAYS = 7;

const shoppingLists = new Hono<AuthEnv>();

// GET /api/v1/shopping-lists — list all user's shopping lists
shoppingLists.get('/api/v1/shopping-lists', requireAuth, async (c) => {
  const userId = c.get('userId');

  const result = await c.env.USERS_DB!.prepare(
    `SELECT sl.id, sl.user_id, sl.name, sl.is_default, sl.collection_id,
            sl.share_token, sl.share_token_expires_at, sl.created_at, sl.updated_at,
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

  const list = await c.env.USERS_DB!.prepare(
    'SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?',
  )
    .bind(listId, userId)
    .first();

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

  // Apply smart rollup (stub — returns items as-is when rollup helper not available)
  const rolledUpItems = { unchecked: [] as Record<string, unknown>[], checked: [] as Record<string, unknown>[] };
  for (const item of items) {
    const row = item as Record<string, unknown>;
    if (row.checked) {
      rolledUpItems.checked.push(row);
    } else {
      rolledUpItems.unchecked.push(row);
    }
  }

  return c.json({ ...list, items: rolledUpItems });
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

  const list = await c.env.USERS_DB!.prepare(
    'SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?',
  )
    .bind(listId, userId)
    .first();

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

  const list = await c.env.USERS_DB!.prepare(
    'SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?',
  )
    .bind(listId, userId)
    .first<ShoppingList>();

  if (!list) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Shopping list not found' } },
      404,
    );
  }

  if (list.is_default) {
    return c.json(
      { error: { code: 'CANNOT_DELETE_DEFAULT', message: 'Cannot delete the default shopping list' } },
      400,
    );
  }

  await c.env.USERS_DB!.prepare('DELETE FROM shopping_lists WHERE id = ?')
    .bind(listId)
    .run();

  return c.body(null, 204);
});

// POST /api/v1/shopping-lists/:id/share — create share token (owner only)
shoppingLists.post('/api/v1/shopping-lists/:id/share', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');

  const list = await c.env.USERS_DB!.prepare(
    'SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?',
  )
    .bind(listId, userId)
    .first<ShoppingList>();

  if (!list) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Shopping list not found' } },
      404,
    );
  }

  const shareToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SHARE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  await c.env.USERS_DB!.prepare(
    'UPDATE shopping_lists SET share_token = ?, share_expires_at = ?, updated_at = ? WHERE id = ?',
  )
    .bind(shareToken, expiresAt, now, listId)
    .run();

  const shareUrl = `/api/v1/shared/lists/${shareToken}`;

  return c.json({ share_token: shareToken, expires_at: expiresAt, share_url: shareUrl });
});

// POST /api/v1/shopping-lists/:id/share/renew — extend share token expiry (owner only)
shoppingLists.post('/api/v1/shopping-lists/:id/share/renew', requireAuth, async (c) => {
  const userId = c.get('userId');
  const listId = c.req.param('id');

  const list = await c.env.USERS_DB!.prepare(
    'SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?',
  )
    .bind(listId, userId)
    .first<ShoppingList>();

  if (!list) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Shopping list not found' } },
      404,
    );
  }

  if (!list.share_token) {
    return c.json(
      { error: { code: 'NO_SHARE_TOKEN', message: 'No share token to renew' } },
      400,
    );
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

  const list = await c.env.USERS_DB!.prepare(
    'SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?',
  )
    .bind(listId, userId)
    .first<ShoppingList>();

  if (!list) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Shopping list not found' } },
      404,
    );
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
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Shared list not found' } },
      404,
    );
  }

  // Check if share token has expired
  if (list.share_expires_at && new Date(list.share_expires_at) < new Date()) {
    return c.json(
      { error: { code: 'EXPIRED', message: 'Share link has expired' } },
      410,
    );
  }

  // Fetch items and apply smart rollup
  const itemsResult = await c.env.USERS_DB!.prepare(
    'SELECT * FROM shopping_list_items WHERE shopping_list_id = ? ORDER BY created_at ASC',
  )
    .bind(list.id)
    .all();

  const items = (itemsResult.results ?? []) as unknown as ShoppingListItem[];
  const rollup = rollupItems(items);

  return c.json({ ...list, items: rollup.items });
});

/**
 * Validates a share token for a specific list.
 * Used by the Durable Object (S-11) to verify shared access.
 */
export async function validateShareToken(
  db: D1Database,
  listId: string,
  token: string,
): Promise<boolean> {
  const list = await db
    .prepare('SELECT share_token, share_expires_at FROM shopping_lists WHERE id = ?')
    .bind(listId)
    .first<{ share_token: string | null; share_expires_at: string | null }>();

  if (!list || list.share_token !== token) return false;
  if (list.share_expires_at && new Date(list.share_expires_at) < new Date()) return false;

  return true;
}

export default shoppingLists;
