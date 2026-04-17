import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '@rr/shared/env';
import type { RecipeDocument, RecipeSummary, User } from '@rr/shared';
import { optionalAuth } from './middleware/auth';
import { getDietaryMask, applyDietaryFilter } from './helpers/dietary-filter';
import authRoutes from './routes/auth';
import bookmarkRoutes from './routes/bookmarks';
import notificationRoutes from './routes/notifications';
import userRoutes from './routes/users';

type AppBindings = { Bindings: Env; Variables: { userId?: string; user?: User } };
const app = new Hono<AppBindings>();

/** Map a D1 row to a RecipeSummary (without tags). */
function toRecipeSummary(row: Record<string, unknown>, tags: string[] = []): RecipeSummary {
  return {
    id: row.id as string,
    title: row.title as string,
    domain: row.domain as string,
    image_url: (row.image_url as string) ?? null,
    total_time: (row.total_time as number) ?? null,
    cook_time: (row.cook_time as number) ?? null,
    yields: (row.yields as string) ?? null,
    cuisine: (row.cuisine as string) ?? null,
    category: (row.category as string) ?? null,
    tags,
  };
}

/** Batch-fetch tags for a list of recipe IDs (1 query instead of N). */
async function batchFetchTags(db: D1Database, ids: string[]): Promise<Map<string, string[]>> {
  const tagMap = new Map<string, string[]>();
  if (ids.length === 0) return tagMap;

  const placeholders = ids.map(() => '?').join(',');
  const result = await db.prepare(
    `SELECT recipe_id, tag FROM recipe_tags WHERE recipe_id IN (${placeholders})`,
  ).bind(...ids).all();

  for (const row of result.results ?? []) {
    const r = row as { recipe_id: string; tag: string };
    const existing = tagMap.get(r.recipe_id) ?? [];
    existing.push(r.tag);
    tagMap.set(r.recipe_id, existing);
  }
  return tagMap;
}

/** Convert rows to RecipeSummary[] with batch-fetched tags. */
async function toRecipeSummaries(db: D1Database, rows: Record<string, unknown>[]): Promise<RecipeSummary[]> {
  const ids = rows.map((r) => r.id as string);
  const tagMap = await batchFetchTags(db, ids);
  return rows.map((r) => toRecipeSummary(r, tagMap.get(r.id as string) ?? []));
}

// ── CORS ────────────────────────────────────────────────────────────────
app.use(
  '*',
  cors({
    origin: ['https://reducedrecipes.com', 'https://reduced-recipes.pages.dev', 'http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Dietary-Prefs'],
    credentials: true,
    maxAge: 86400,
  }),
);

// ── Health ──────────────────────────────────────────────────────────────
app.get('/api/v1/health', async (c) => {
  const results = await c.env.DB.batch([
    c.env.DB.prepare('SELECT COUNT(*) as total FROM recipes'),
    c.env.DB.prepare("SELECT COUNT(*) as total FROM crawl_queue WHERE status='pending'"),
    c.env.DB.prepare("SELECT COUNT(*) as total FROM crawl_queue WHERE status='failed'"),
    c.env.DB.prepare('SELECT COUNT(*) as total FROM domains WHERE active=1'),
  ]);

  const getTotal = (r: D1Result | undefined): number =>
    ((r?.results?.[0] as Record<string, number> | undefined)?.total) ?? 0;

  return c.json({
    ok: true,
    total_recipes: getTotal(results[0]),
    pending_crawls: getTotal(results[1]),
    failed_crawls: getTotal(results[2]),
    active_domains: getTotal(results[3]),
  });
});

// ── Recipe detail ───────────────────────────────────────────────────────
app.get('/api/v1/recipes/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const value = await c.env.RECIPES_KV.get(`recipe:${id}`, 'text');

  if (value === null) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Recipe not found' } }, 404);
  }

  // Fire-and-forget recipe view tracking for authenticated users
  const userId = c.get('userId');
  if (userId && c.env.USERS_DB) {
    c.executionCtx.waitUntil(
      c.env.USERS_DB
        .prepare(
          `INSERT OR IGNORE INTO recipe_views (user_id, recipe_id, source, viewed_date, viewed_at)
           VALUES (?, ?, 'view', date('now'), datetime('now'))`,
        )
        .bind(userId, id)
        .run()
        .catch(() => {}),
    );
  }

  const doc: RecipeDocument = JSON.parse(value);
  return c.json(doc, 200, {
    'Cache-Control': 'public, max-age=3600, s-maxage=86400',
  });
});

// ── List recipes ─────────────────────────────────────────────────────────
app.get('/api/v1/recipes', optionalAuth, async (c) => {
  const { tag, domain, cuisine, max_time, min_time, cursor, limit: limitParam } = c.req.query();
  const limit = Math.min(Math.max(parseInt(limitParam || '24', 10) || 24, 1), 100);

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (domain) {
    conditions.push('r.domain = ?');
    params.push(domain);
  }
  if (cuisine) {
    conditions.push('r.cuisine = ?');
    params.push(cuisine);
  }
  if (max_time) {
    conditions.push('r.total_time <= ?');
    params.push(parseInt(max_time, 10));
  }
  if (min_time) {
    conditions.push('r.total_time >= ?');
    params.push(parseInt(min_time, 10));
  }
  if (cursor) {
    conditions.push('r.extracted_at < ?');
    params.push(cursor);
  }

  // Dietary bitmask filtering
  const dietaryMask = await getDietaryMask(c);
  applyDietaryFilter(conditions, params, dietaryMask);

  let joinClause = '';
  if (tag) {
    joinClause = 'JOIN recipe_tags rt ON rt.recipe_id = r.id';
    conditions.push('rt.tag = ?');
    params.push(tag);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `SELECT r.id, r.title, r.domain, r.image_url, r.total_time, r.cook_time, r.yields, r.cuisine, r.category, r.extracted_at FROM recipes r ${joinClause} ${whereClause} ORDER BY r.extracted_at DESC LIMIT ?`;
  params.push(limit + 1);

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  const rows = result.results || [];

  let next_cursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    const lastRow = rows[rows.length - 1] as Record<string, unknown>;
    next_cursor = lastRow.extracted_at as string;
  }

  const items = await toRecipeSummaries(c.env.DB, rows as Record<string, unknown>[]);

  return c.json({ items, next_cursor });
});

// ── Tags ─────────────────────────────────────────────────────────────────
app.get('/api/v1/tags', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT tag, COUNT(*) as count FROM recipe_tags GROUP BY tag ORDER BY count DESC LIMIT 200',
  ).all();

  const tags = (result.results || []).map((r) => {
    const row = r as Record<string, unknown>;
    return { tag: row.tag as string, count: row.count as number };
  });

  return c.json(tags, 200, {
    'Cache-Control': 'public, max-age=3600',
  });
});

// ── Domains ──────────────────────────────────────────────────────────────
app.get('/api/v1/domains', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT domain, recipe_count, last_spidered FROM domains WHERE active=1 ORDER BY recipe_count DESC',
  ).all();

  const domains = (result.results || []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      domain: row.domain as string,
      recipe_count: row.recipe_count as number,
      last_spidered: row.last_spidered as string,
    };
  });

  return c.json(domains, 200, {
    'Cache-Control': 'public, max-age=3600',
  });
});

// ── Domain recipes ───────────────────────────────────────────────────────
app.get('/api/v1/domains/:domain/recipes', optionalAuth, async (c) => {
  const domain = c.req.param('domain');
  const { tag, cuisine, max_time, min_time, cursor, limit: limitParam } = c.req.query();
  const limit = Math.min(Math.max(parseInt(limitParam || '24', 10) || 24, 1), 100);

  const conditions: string[] = ['r.domain = ?'];
  const params: (string | number)[] = [domain];

  if (cuisine) {
    conditions.push('r.cuisine = ?');
    params.push(cuisine);
  }
  if (max_time) {
    conditions.push('r.total_time <= ?');
    params.push(parseInt(max_time, 10));
  }
  if (min_time) {
    conditions.push('r.total_time >= ?');
    params.push(parseInt(min_time, 10));
  }
  if (cursor) {
    conditions.push('r.extracted_at < ?');
    params.push(cursor);
  }

  // Dietary bitmask filtering
  const dietaryMask = await getDietaryMask(c);
  applyDietaryFilter(conditions, params, dietaryMask);

  let joinClause = '';
  if (tag) {
    joinClause = 'JOIN recipe_tags rt ON rt.recipe_id = r.id';
    conditions.push('rt.tag = ?');
    params.push(tag);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const sql = `SELECT r.id, r.title, r.domain, r.image_url, r.total_time, r.cook_time, r.yields, r.cuisine, r.category, r.extracted_at FROM recipes r ${joinClause} ${whereClause} ORDER BY r.extracted_at DESC LIMIT ?`;
  params.push(limit + 1);

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  const rows = result.results || [];

  let next_cursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    const lastRow = rows[rows.length - 1] as Record<string, unknown>;
    next_cursor = lastRow.extracted_at as string;
  }

  const items = await toRecipeSummaries(c.env.DB, rows as Record<string, unknown>[]);

  return c.json({ items, next_cursor });
});

// ── Search ────────────────────────────────────────────────────────────
app.get('/api/v1/search', optionalAuth, async (c) => {
  const q = c.req.query('q') ?? '';
  const limitParam = c.req.query('limit');
  const offsetParam = c.req.query('offset');
  const limit = Math.min(Math.max(parseInt(limitParam ?? '24', 10) || 24, 1), 50);
  const offset = Math.max(parseInt(offsetParam ?? '0', 10) || 0, 0);

  if (q.length < 2) {
    return c.json(
      { error: { code: 'INVALID_QUERY', message: 'Query must be at least 2 characters' } },
      400,
    );
  }

  const sanitized = q.replace(/\b(AND|OR|NOT)\b/g, ' ').replace(/[*"():^~\-:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!sanitized) {
    return c.json({ items: [], next_cursor: null }, 200);
  }

  // Dietary bitmask filtering for search
  const dietaryMask = await getDietaryMask(c);
  const dietaryClause = dietaryMask > 0 ? 'AND (r.dietary_bitmask & ?4) = ?4' : '';
  const bindParams: (string | number)[] = [sanitized, limit + 1, offset];
  if (dietaryMask > 0) bindParams.push(dietaryMask);

  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.title, r.domain, r.image_url, r.total_time, r.cook_time,
            r.yields, r.cuisine, r.category
     FROM recipes_fts fts
     JOIN recipes r ON fts.rowid = r.rowid
     WHERE recipes_fts MATCH ?1 ${dietaryClause}
     LIMIT ?2 OFFSET ?3`,
  )
    .bind(...bindParams)
    .all();

  const rows = results ?? [];
  const has_more = rows.length > limit;
  if (has_more) rows.pop();

  const items: RecipeSummary[] = rows.map((row: Record<string, unknown>) => toRecipeSummary(row));

  return c.json({ items, has_more });
});

// ── Admin: Seed domain ────────────────────────────────────────────────
app.post('/api/v1/admin/seed', async (c) => {
  const authHeader = c.req.header('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token || token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: { code: 401, message: 'Unauthorized' } }, 401);
  }

  const body = await c.req.json<{
    domain: string;
    sitemap_url?: string;
    crawl_delay_ms?: number;
  }>();

  if (!body.domain) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'domain is required' } }, 400);
  }

  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO domains (domain, sitemap_url, crawl_delay_ms, recipe_count, active) VALUES (?1, ?2, ?3, 0, 1)',
  )
    .bind(body.domain, body.sitemap_url ?? null, body.crawl_delay_ms ?? null)
    .run();

  return c.json({ ok: true, domain: body.domain });
});

// ── Admin: Rebuild projections ────────────────────────────────────────
app.post('/api/v1/admin/rebuild', async (c) => {
  const authHeader = c.req.header('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token || token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: { code: 401, message: 'Unauthorized' } }, 401);
  }

  let cursor: string | null = null;
  let queued = 0;

  do {
    const opts: KVNamespaceListOptions = { prefix: 'recipe:', limit: 100 };
    if (cursor) opts.cursor = cursor;
    const list = await c.env.RECIPES_KV.list(opts);
    for (const key of list.keys) {
      const value = await c.env.RECIPES_KV.get(key.name, 'text');
      if (value) {
        const doc: RecipeDocument = JSON.parse(value);
        const id = key.name.replace('recipe:', '');
        await c.env.PROJECTION_QUEUE.send({ id, doc });
        queued++;
      }
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  return c.json({ ok: true, queued });
});

// ── Removal request ──────────────────────────────────────────────────
app.post('/api/v1/remove', async (c) => {
  const body = await c.req.json<{ url: string; email: string; reason: string }>();

  if (!body.url || !body.email) {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'url and email are required' } },
      400,
    );
  }

  console.log(JSON.stringify({
    type: 'REMOVAL_REQUEST',
    url: body.url,
    email: body.email,
    reason: body.reason ?? '',
    timestamp: new Date().toISOString(),
  }));
  return c.json({ ok: true, message: 'Request logged' });
});

// ── Security headers ────────────────────────────────────────────────────
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  );
  c.header(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'",
  );
});

// ── Mount route modules ─────────────────────────────────────────────────
app.route('/', authRoutes);
app.route('/', bookmarkRoutes);
app.route('/', notificationRoutes);
app.route('/', userRoutes);

// ── Global error handler ────────────────────────────────────────────────
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    500,
  );
});

export default app;
