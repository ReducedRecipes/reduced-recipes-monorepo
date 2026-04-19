import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import type { BookmarkSyncAction, BookmarkSyncResult, ShoppingListItemSyncAction, ShoppingListItemSyncResult, ShoppingListItem } from '@rr/shared';
import { requireAuth } from '../middleware/auth';

type AuthEnv = { Bindings: Env; Variables: { userId: string } };

const sync = new Hono<AuthEnv>();

/** Build a conflict result by fetching the current server state for the given item. */
async function buildConflictResult(
  db: D1Database,
  itemId: string,
): Promise<ShoppingListItemSyncResult> {
  const serverState = await db
    .prepare('SELECT * FROM shopping_list_items WHERE id = ?')
    .bind(itemId)
    .first<ShoppingListItem>();
  const conflict: ShoppingListItemSyncResult = {
    item_id: itemId,
    status: 'conflict',
  };
  if (serverState) conflict.server_state = serverState;
  return conflict;
}

// POST /api/v1/sync/bookmarks — batch sync with last-write-wins
sync.post('/api/v1/sync/bookmarks', requireAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ actions: BookmarkSyncAction[] }>();

  if (!body.actions || !Array.isArray(body.actions) || body.actions.length === 0) {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'actions array is required and must not be empty' } },
      400,
    );
  }

  // Get user's default collection for actions without collection_id
  const defaultCollection = await c.env.USERS_DB!.prepare(
    'SELECT id FROM collections WHERE user_id = ? AND is_default = 1',
  )
    .bind(userId)
    .first<{ id: string }>();

  if (!defaultCollection) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Default collection not found' } },
      404,
    );
  }

  const results: BookmarkSyncResult[] = [];

  for (const action of body.actions) {
    const collectionId = action.collection_id ?? defaultCollection.id;

    // Find existing bookmark for this recipe+collection
    const existing = await c.env.USERS_DB!.prepare(
      'SELECT id, updated_at FROM bookmarks WHERE user_id = ? AND collection_id = ? AND recipe_id = ?',
    )
      .bind(userId, collectionId, action.recipe_id)
      .first<{ id: string; updated_at: string }>();

    if (action.action === 'add') {
      if (existing) {
        // Compare timestamps — last-write-wins
        if (action.client_timestamp > existing.updated_at) {
          // Client is newer — update the timestamp
          await c.env.USERS_DB!.prepare(
            'UPDATE bookmarks SET updated_at = ? WHERE id = ?',
          )
            .bind(action.client_timestamp, existing.id)
            .run();
          results.push({ recipe_id: action.recipe_id, status: 'applied' });
        } else {
          // Server is newer — conflict
          results.push({
            recipe_id: action.recipe_id,
            status: 'conflict',
            server_state: { exists: true, updated_at: existing.updated_at },
          });
        }
      } else {
        // No existing bookmark — create it
        const id = crypto.randomUUID();
        await c.env.USERS_DB!.prepare(
          'INSERT INTO bookmarks (id, user_id, collection_id, recipe_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
          .bind(id, userId, collectionId, action.recipe_id, action.client_timestamp, action.client_timestamp)
          .run();
        results.push({ recipe_id: action.recipe_id, status: 'applied' });
      }
    } else if (action.action === 'remove') {
      if (existing) {
        // Compare timestamps — last-write-wins
        if (action.client_timestamp > existing.updated_at) {
          // Client is newer — delete
          await c.env.USERS_DB!.prepare(
            'DELETE FROM bookmarks WHERE id = ?',
          )
            .bind(existing.id)
            .run();
          results.push({ recipe_id: action.recipe_id, status: 'applied' });
        } else {
          // Server is newer — conflict
          results.push({
            recipe_id: action.recipe_id,
            status: 'conflict',
            server_state: { exists: true, updated_at: existing.updated_at },
          });
        }
      } else {
        // Already doesn't exist — treat as applied
        results.push({ recipe_id: action.recipe_id, status: 'applied' });
      }
    }
  }

  return c.json({ results });
});

// POST /api/v1/sync/shopping-list-items — idempotent batch sync
sync.post('/api/v1/sync/shopping-list-items', requireAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ actions?: ShoppingListItemSyncAction[]; mutations?: ShoppingListItemSyncAction[] }>();
  const actions = body.mutations ?? body.actions;

  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'actions array is required and must not be empty' } },
      400,
    );
  }

  const results: ShoppingListItemSyncResult[] = [];

  for (const action of actions) {
    // Verify user owns the shopping list
    const list = await c.env.USERS_DB!.prepare(
      'SELECT id FROM shopping_lists WHERE id = ? AND user_id = ?',
    )
      .bind(action.shopping_list_id, userId)
      .first<{ id: string }>();

    if (!list) {
      continue; // Skip actions for lists the user doesn't own
    }

    if (action.type === 'check_item' && action.item_id) {
      const existing = await c.env.USERS_DB!.prepare(
        'SELECT id, checked, updated_at FROM shopping_list_items WHERE id = ? AND shopping_list_id = ?',
      )
        .bind(action.item_id, action.shopping_list_id)
        .first<{ id: string; checked: number; updated_at: string }>();

      if (!existing) {
        continue;
      }

      if (action.client_timestamp > existing.updated_at) {
        await c.env.USERS_DB!.prepare(
          'UPDATE shopping_list_items SET checked = ?, updated_at = ? WHERE id = ?',
        )
          .bind(action.checked ? 1 : 0, action.client_timestamp, action.item_id)
          .run();
        results.push({ item_id: action.item_id, status: 'applied' });
      } else {
        results.push(await buildConflictResult(c.env.USERS_DB!, action.item_id));
      }
    } else if (action.type === 'add_item' && action.text) {
      // Idempotent: check if an item with same text already exists (by item_id + action + timestamp)
      if (action.item_id) {
        const existing = await c.env.USERS_DB!.prepare(
          'SELECT id FROM shopping_list_items WHERE id = ? AND shopping_list_id = ?',
        )
          .bind(action.item_id, action.shopping_list_id)
          .first<{ id: string }>();

        if (existing) {
          results.push({ item_id: action.item_id, status: 'applied' }); // Already exists, idempotent
          continue;
        }
      }

      const id = action.item_id || crypto.randomUUID();
      const maxPos = await c.env.USERS_DB!.prepare(
        'SELECT COALESCE(MAX(position), 0) as max_pos FROM shopping_list_items WHERE shopping_list_id = ?',
      )
        .bind(action.shopping_list_id)
        .first<{ max_pos: number }>();

      await c.env.USERS_DB!.prepare(
        `INSERT INTO shopping_list_items (id, shopping_list_id, recipe_id, original_text, quantity, unit, item, checked, parse_failed, parsing, source, position, created_at, updated_at)
         VALUES (?, ?, NULL, ?, ?, NULL, NULL, 0, 0, 0, 'manual', ?, ?, ?)`,
      )
        .bind(
          id,
          action.shopping_list_id,
          action.text,
          action.quantity ?? null,
          (maxPos?.max_pos ?? 0) + 1,
          action.client_timestamp,
          action.client_timestamp,
        )
        .run();
      results.push({ item_id: id, status: 'applied' });
    } else if (action.type === 'remove_item' && action.item_id) {
      const existing = await c.env.USERS_DB!.prepare(
        'SELECT id, updated_at FROM shopping_list_items WHERE id = ? AND shopping_list_id = ?',
      )
        .bind(action.item_id, action.shopping_list_id)
        .first<{ id: string; updated_at: string }>();

      if (!existing) {
        results.push({ item_id: action.item_id, status: 'applied' }); // Already removed, idempotent
        continue;
      }

      if (action.client_timestamp > existing.updated_at) {
        await c.env.USERS_DB!.prepare(
          'DELETE FROM shopping_list_items WHERE id = ?',
        )
          .bind(action.item_id)
          .run();
        results.push({ item_id: action.item_id, status: 'applied' });
      } else {
        results.push(await buildConflictResult(c.env.USERS_DB!, action.item_id));
      }
    } else if (action.type === 'update_quantity' && action.item_id && action.quantity != null) {
      const existing = await c.env.USERS_DB!.prepare(
        'SELECT id, updated_at FROM shopping_list_items WHERE id = ? AND shopping_list_id = ?',
      )
        .bind(action.item_id, action.shopping_list_id)
        .first<{ id: string; updated_at: string }>();

      if (!existing) {
        continue;
      }

      if (action.client_timestamp > existing.updated_at) {
        await c.env.USERS_DB!.prepare(
          'UPDATE shopping_list_items SET quantity = ?, updated_at = ? WHERE id = ?',
        )
          .bind(action.quantity, action.client_timestamp, action.item_id)
          .run();
        results.push({ item_id: action.item_id, status: 'applied' });
      } else {
        results.push(await buildConflictResult(c.env.USERS_DB!, action.item_id));
      }
    }
  }

  return c.json({ results });
});

export default sync;
