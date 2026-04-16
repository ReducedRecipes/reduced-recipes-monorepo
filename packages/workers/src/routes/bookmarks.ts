import { Hono } from 'hono';
import type { Env, Bookmark } from '@rr/shared';
import { requireAuth } from '../middleware/auth';

type AuthEnv = { Bindings: Env; Variables: { userId: string } };

const bookmarks = new Hono<AuthEnv>();

bookmarks.use('*', requireAuth);

// POST /api/v1/bookmarks — add a recipe to the default Saved collection
bookmarks.post('/api/v1/bookmarks', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ recipe_id: string }>();

  if (!body.recipe_id || typeof body.recipe_id !== 'string') {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'recipe_id is required' } },
      400,
    );
  }

  // Validate recipe exists in recipes DB
  const recipe = await c.env.DB.prepare('SELECT id FROM recipes WHERE id = ?')
    .bind(body.recipe_id)
    .first();

  if (!recipe) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Recipe not found' } },
      404,
    );
  }

  // Get user's default collection
  const collection = await c.env.USERS_DB!.prepare(
    'SELECT id FROM collections WHERE user_id = ? AND is_default = 1',
  )
    .bind(userId)
    .first<{ id: string }>();

  if (!collection) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Default collection not found' } },
      404,
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await c.env.USERS_DB!.prepare(
      'INSERT INTO bookmarks (id, user_id, collection_id, recipe_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(id, userId, collection.id, body.recipe_id, now, now)
      .run();
  } catch (err: unknown) {
    // UNIQUE constraint violation — already bookmarked
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return c.json(
        { error: { code: 'ALREADY_BOOKMARKED', message: 'Recipe already bookmarked in this collection' } },
        409,
      );
    }
    throw err;
  }

  return c.json(
    { id, recipe_id: body.recipe_id, collection_id: collection.id, created_at: now },
    201,
  );
});

// DELETE /api/v1/bookmarks/:id — remove a bookmark (must be owned by user)
bookmarks.delete('/api/v1/bookmarks/:id', async (c) => {
  const userId = c.get('userId');
  const bookmarkId = c.req.param('id');

  const existing = await c.env.USERS_DB!.prepare(
    'SELECT id FROM bookmarks WHERE id = ? AND user_id = ?',
  )
    .bind(bookmarkId, userId)
    .first();

  if (!existing) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Bookmark not found' } },
      404,
    );
  }

  await c.env.USERS_DB!.prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?')
    .bind(bookmarkId, userId)
    .run();

  return c.json({ ok: true });
});

// GET /api/v1/bookmarks — list user's bookmarks with cursor pagination
bookmarks.get('/api/v1/bookmarks', async (c) => {
  const userId = c.get('userId');
  const cursor = c.req.query('cursor');
  const limitParam = c.req.query('limit');
  const limit = Math.min(Math.max(parseInt(limitParam || '25', 10) || 25, 1), 100);

  const conditions = ['user_id = ?'];
  const params: (string | number)[] = [userId];

  if (cursor) {
    conditions.push('created_at < ?');
    params.push(cursor);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  params.push(limit + 1);

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

export default bookmarks;
