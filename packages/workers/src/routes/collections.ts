import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import type { Collection } from '@rr/shared';
import { requireAuth } from '../middleware/auth';

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

export default collections;
