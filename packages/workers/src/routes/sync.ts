import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import type { BookmarkSyncAction, BookmarkSyncResult } from '@rr/shared';
import { requireAuth } from '../middleware/auth';

type AuthEnv = { Bindings: Env; Variables: { userId: string } };

const sync = new Hono<AuthEnv>();

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

export default sync;
