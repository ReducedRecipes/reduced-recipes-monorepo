import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import type { Collection, Bookmark } from '@rr/shared';
import { requireAuth } from '../middleware/auth';
import { parseCursorPagination } from './helpers';

type AuthEnv = { Bindings: Env; Variables: { userId: string } };

const collections = new Hono<AuthEnv>();

// GET /api/v1/collections — list user's collections ordered by position
collections.get('/api/v1/collections', requireAuth, async (c) => {
  const userId = c.get('userId');

  const result = await c.env.USERS_DB!.prepare(
    'SELECT id, user_id, name, is_default, is_public, position, created_at, updated_at FROM collections WHERE user_id = ? ORDER BY position ASC',
  )
    .bind(userId)
    .all();

  const items = (result.results ?? []) as unknown as Collection[];

  return c.json({ items });
});

// POST /api/v1/collections — create a new collection
collections.post('/api/v1/collections', requireAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ name: string; is_public?: boolean }>();

  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'name is required' } },
      400,
    );
  }

  const name = body.name.trim();

  // Check for duplicate name
  const existing = await c.env.USERS_DB!.prepare(
    'SELECT id FROM collections WHERE user_id = ? AND name = ?',
  )
    .bind(userId, name)
    .first();

  if (existing) {
    return c.json(
      { error: { code: 'ALREADY_EXISTS', message: 'A collection with this name already exists' } },
      409,
    );
  }

  // Get next position
  const maxPos = await c.env.USERS_DB!.prepare(
    'SELECT MAX(position) as max_pos FROM collections WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ max_pos: number | null }>();

  const position = (maxPos?.max_pos ?? -1) + 1;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const isPublic = body.is_public ? 1 : 0;

  await c.env.USERS_DB!.prepare(
    'INSERT INTO collections (id, user_id, name, is_default, is_public, position, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)',
  )
    .bind(id, userId, name, isPublic, position, now, now)
    .run();

  const collection: Collection = {
    id,
    user_id: userId,
    name,
    is_default: 0,
    is_public: isPublic,
    position,
    created_at: now,
    updated_at: now,
  };

  return c.json(collection, 201);
});

// PATCH /api/v1/collections/:id — update name, is_public, and/or position
collections.patch('/api/v1/collections/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const collectionId = c.req.param('id');
  const body = await c.req.json<{ name?: string; is_public?: boolean; position?: number }>();

  // Fetch existing collection owned by user
  const existing = await c.env.USERS_DB!.prepare(
    'SELECT id, user_id, name, is_default, is_public, position, created_at, updated_at FROM collections WHERE id = ? AND user_id = ?',
  )
    .bind(collectionId, userId)
    .first<Collection>();

  if (!existing) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Collection not found' } },
      404,
    );
  }

  const updates: string[] = [];
  const params: (string | number)[] = [];
  const now = new Date().toISOString();

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return c.json(
        { error: { code: 'INVALID_INPUT', message: 'name cannot be empty' } },
        400,
      );
    }
    // Check for duplicate name (different collection)
    const dup = await c.env.USERS_DB!.prepare(
      'SELECT id FROM collections WHERE user_id = ? AND name = ? AND id != ?',
    )
      .bind(userId, name, collectionId)
      .first();
    if (dup) {
      return c.json(
        { error: { code: 'ALREADY_EXISTS', message: 'A collection with this name already exists' } },
        409,
      );
    }
    updates.push('name = ?');
    params.push(name);
  }

  if (body.is_public !== undefined) {
    updates.push('is_public = ?');
    params.push(body.is_public ? 1 : 0);
  }

  if (body.position !== undefined) {
    updates.push('position = ?');
    params.push(body.position);
  }

  if (updates.length === 0) {
    return c.json(existing);
  }

  updates.push('updated_at = ?');
  params.push(now);
  params.push(collectionId, userId);

  await c.env.USERS_DB!.prepare(
    `UPDATE collections SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
  )
    .bind(...params)
    .run();

  const updated: Collection = {
    ...existing,
    name: body.name !== undefined ? (typeof body.name === 'string' ? body.name.trim() : existing.name) : existing.name,
    is_public: body.is_public !== undefined ? (body.is_public ? 1 : 0) : existing.is_public,
    position: body.position !== undefined ? body.position : existing.position,
    updated_at: now,
  };

  return c.json(updated);
});

// DELETE /api/v1/collections/:id — delete collection (moves bookmarks to default first)
collections.delete('/api/v1/collections/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const collectionId = c.req.param('id');

  const existing = await c.env.USERS_DB!.prepare(
    'SELECT id, is_default FROM collections WHERE id = ? AND user_id = ?',
  )
    .bind(collectionId, userId)
    .first<{ id: string; is_default: number }>();

  if (!existing) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Collection not found' } },
      404,
    );
  }

  if (existing.is_default === 1) {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'Cannot delete the default collection' } },
      400,
    );
  }

  // Get default collection to migrate bookmarks
  const defaultCol = await c.env.USERS_DB!.prepare(
    'SELECT id FROM collections WHERE user_id = ? AND is_default = 1',
  )
    .bind(userId)
    .first<{ id: string }>();

  if (defaultCol) {
    // Move bookmarks to default collection
    await c.env.USERS_DB!.prepare(
      'UPDATE bookmarks SET collection_id = ?, updated_at = ? WHERE collection_id = ? AND user_id = ?',
    )
      .bind(defaultCol.id, new Date().toISOString(), collectionId, userId)
      .run();
  }

  await c.env.USERS_DB!.prepare(
    'DELETE FROM collections WHERE id = ? AND user_id = ?',
  )
    .bind(collectionId, userId)
    .run();

  return c.body(null, 204);
});

// GET /api/v1/collections/:id/bookmarks — paginated bookmarks in a collection
collections.get('/api/v1/collections/:id/bookmarks', requireAuth, async (c) => {
  const userId = c.get('userId');
  const collectionId = c.req.param('id');
  const { limit, cursor, limitPlusOne } = parseCursorPagination(c);

  // Verify collection ownership
  const col = await c.env.USERS_DB!.prepare(
    'SELECT id FROM collections WHERE id = ? AND user_id = ?',
  )
    .bind(collectionId, userId)
    .first();

  if (!col) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Collection not found' } },
      404,
    );
  }

  const conditions = ['user_id = ?', 'collection_id = ?'];
  const params: (string | number)[] = [userId, collectionId];

  if (cursor) {
    conditions.push('created_at < ?');
    params.push(cursor);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  params.push(limitPlusOne);

  const result = await c.env.USERS_DB!.prepare(
    `SELECT id, user_id, collection_id, recipe_id, created_at, updated_at
     FROM bookmarks ${whereClause}
     ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(...params)
    .all();

  const rows = (result.results ?? []) as unknown as Bookmark[];

  let next_cursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    const last = rows[rows.length - 1];
    if (last) next_cursor = last.created_at;
  }

  return c.json({ items: rows, next_cursor });
});

export default collections;
