import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import type { Bookmark } from '@rr/shared';
import { requireAuth } from '../middleware/auth';
import { parseLimit, paginateRows } from '../helpers/pagination';
import { validateCollectionOwnership } from '../helpers/collection-ownership';
import { castVote } from '../helpers/hot-score';

type AuthEnv = { Bindings: Env; Variables: { userId: string } };

const bookmarks = new Hono<AuthEnv>();

// POST /api/v1/bookmarks — add a recipe to a collection (default if no collection_id)
bookmarks.post('/api/v1/bookmarks', requireAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ recipe_id: string; collection_id?: string | null }>();

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

  let collectionId: string;

  if (body.collection_id) {
    // Validate the specified collection exists and belongs to user
    const col = await validateCollectionOwnership(c.env.USERS_DB!, body.collection_id, userId);

    if (!col) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'Collection not found' } },
        404,
      );
    }
    collectionId = col.id;
  } else {
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
    collectionId = collection.id;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await c.env.USERS_DB!.prepare(
      'INSERT INTO bookmarks (id, user_id, collection_id, recipe_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(id, userId, collectionId, body.recipe_id, now, now)
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

  // Fire-and-forget implicit vote (weight 1.0 bookmark signal) for hot score
  try {
    c.executionCtx.waitUntil(
      castVote(
        c.env.USERS_DB!,
        c.env.DB,
        userId,
        body.recipe_id,
        'bookmark',
        parseFloat(c.env.WEIGHT_HEART ?? '1.0') || 1.0,
        parseInt(c.env.HOT_DECAY_SECONDS ?? '90000', 10) || 90000,
        parseInt(c.env.HOT_EPOCH ?? '1704067200', 10) || 1704067200,
      ).catch(() => {}),
    );
  } catch {
    // No execution context (e.g. tests) — skip fire-and-forget
  }

  return c.json(
    { id, user_id: userId, recipe_id: body.recipe_id, collection_id: collectionId, created_at: now, updated_at: now, recipe_deleted_at: null },
    201,
  );
});

// POST /api/v1/bookmarks/move — move a bookmark to a different collection
bookmarks.post('/api/v1/bookmarks/move', requireAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ bookmark_id: string; target_collection_id: string }>();

  if (!body.bookmark_id || typeof body.bookmark_id !== 'string') {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'bookmark_id is required' } },
      400,
    );
  }

  if (!body.target_collection_id || typeof body.target_collection_id !== 'string') {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'target_collection_id is required' } },
      400,
    );
  }

  // Validate bookmark exists and belongs to user
  const bookmark = await c.env.USERS_DB!.prepare(
    'SELECT id, collection_id, recipe_id FROM bookmarks WHERE id = ? AND user_id = ?',
  )
    .bind(body.bookmark_id, userId)
    .first<{ id: string; collection_id: string; recipe_id: string }>();

  if (!bookmark) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Bookmark not found' } },
      404,
    );
  }

  // Validate target collection exists and belongs to user
  const targetCollection = await validateCollectionOwnership(c.env.USERS_DB!, body.target_collection_id, userId);

  if (!targetCollection) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Target collection not found' } },
      404,
    );
  }

  const now = new Date().toISOString();

  try {
    await c.env.USERS_DB!.prepare(
      'UPDATE bookmarks SET collection_id = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    )
      .bind(body.target_collection_id, now, body.bookmark_id, userId)
      .run();
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return c.json(
        { error: { code: 'ALREADY_BOOKMARKED', message: 'Recipe already exists in target collection' } },
        409,
      );
    }
    throw err;
  }

  return c.json({ success: true });
});

// GET /api/v1/bookmarks/search — search bookmarked recipes by title/description
bookmarks.get('/api/v1/bookmarks/search', requireAuth, async (c) => {
  const userId = c.get('userId');
  const query = c.req.query('q');
  const collectionId = c.req.query('collection_id');

  if (!query || query.trim() === '') {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'Search query (q) is required' } },
      400,
    );
  }

  // Get bookmark recipe_ids from USERS_DB (optionally filtered by collection)
  let bookmarkSql = 'SELECT id, recipe_id, collection_id, created_at, updated_at FROM bookmarks WHERE user_id = ?';
  const bookmarkParams: string[] = [userId];

  if (collectionId) {
    bookmarkSql += ' AND collection_id = ?';
    bookmarkParams.push(collectionId);
  }

  const bookmarkResult = await c.env.USERS_DB!.prepare(bookmarkSql)
    .bind(...bookmarkParams)
    .all();

  const bookmarkRows = (bookmarkResult.results ?? []) as unknown as {
    id: string;
    recipe_id: string;
    collection_id: string;
    created_at: string;
    updated_at: string;
  }[];

  if (bookmarkRows.length === 0) {
    return c.json({ items: [] });
  }

  // Search recipes in the recipes DB matching the query
  const recipeIds = bookmarkRows.map((b) => b.recipe_id);
  const placeholders = recipeIds.map(() => '?').join(',');
  const searchPattern = `%${query.trim()}%`;

  const recipeResult = await c.env.DB.prepare(
    `SELECT id, title, domain, image_url, total_time, cook_time, yields, cuisine
     FROM recipes
     WHERE id IN (${placeholders})
       AND (title LIKE ?)`,
  )
    .bind(...recipeIds, searchPattern)
    .all();

  const recipes = (recipeResult.results ?? []) as unknown as {
    id: string;
    title: string;
    domain: string;
    image_url: string | null;
    total_time: number | null;
    cook_time: number | null;
    yields: string | null;
    cuisine: string | null;
  }[];

  // Merge bookmark metadata with recipe details
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const items = bookmarkRows
    .filter((b) => recipeMap.has(b.recipe_id))
    .map((b) => ({
      ...recipeMap.get(b.recipe_id)!,
      id: b.id,
      recipe_id: b.recipe_id,
      collection_id: b.collection_id,
      created_at: b.created_at,
      updated_at: b.updated_at,
    }));

  return c.json({ items });
});

// DELETE /api/v1/bookmarks/:id — remove a bookmark (must be owned by user)
bookmarks.delete('/api/v1/bookmarks/:id', requireAuth, async (c) => {
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
bookmarks.get('/api/v1/bookmarks', requireAuth, async (c) => {
  const userId = c.get('userId');
  const cursor = c.req.query('cursor');
  const limit = parseLimit(c.req.query('limit'));

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

  return c.json(paginateRows(rows, limit, 'created_at'));
});

export default bookmarks;
