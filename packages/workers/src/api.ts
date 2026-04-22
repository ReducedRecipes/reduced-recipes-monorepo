import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '@rr/shared/env';
import type { RecipeDocument, RecipeSummary, User } from '@rr/shared';
import { optionalAuth } from './middleware/auth';
import { getDietaryMask, applyDietaryFilter } from './helpers/dietary-filter';
import { parseExclusions } from './helpers/query-parser';
import { castVote } from './helpers/hot-score';
import authRoutes from './routes/auth';
import bookmarkRoutes from './routes/bookmarks';
import notificationRoutes from './routes/notifications';
import userRoutes from './routes/users';
import collectionsRoutes from './routes/collections';
import syncRoutes from './routes/sync';
import shoppingListRoutes from './routes/shopping-lists';
import ingredientSearchRoutes from './routes/ingredient-search';
import heartRoutes from './routes/hearts';
import fundingRoutes from './routes/funding';
import searchSimilarRoutes from './routes/search-similar';

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
    origin: (origin) => {
      const allowed = [
        'https://reducedrecipes.com',
        'https://reduced.recipes',
        'https://reduced-recipes.pages.dev',
        'http://localhost:5173',
      ];
      // Allow all *.reduced-recipes.pages.dev preview URLs
      if (origin.endsWith('.reduced-recipes.pages.dev') || allowed.includes(origin)) {
        return origin;
      }
      // Allow workers.dev preview URLs
      if (origin.endsWith('.workers.dev')) {
        return origin;
      }
      return allowed[0];
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Dietary-Prefs'],
    credentials: true,
    maxAge: 86400,
  }),
);

// ── Health (KV-cached, 5-minute TTL) ────────────────────────────────────
app.get('/api/v1/health', async (c) => {
  const HEALTH_CACHE_KEY = 'cache:health';
  const HEALTH_TTL = 300; // 5 minutes

  // Try KV cache first
  const cached = await c.env.CACHE_KV.get(HEALTH_CACHE_KEY, 'text');
  if (cached) {
    return c.json(JSON.parse(cached), 200, {
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
    });
  }

  const minVotesFeatured = parseInt(c.env.HOT_MIN_VOTES_FEATURED ?? '3', 10) || 3;

  const [results, featuredRow] = await Promise.all([
    c.env.DB.batch([
      c.env.DB.prepare('SELECT COUNT(*) as total FROM recipes'),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM crawl_queue WHERE status='pending'"),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM crawl_queue WHERE status='failed'"),
      c.env.DB.prepare('SELECT COUNT(*) as total FROM domains WHERE active=1'),
      c.env.DB.prepare('SELECT COALESCE(SUM(words_removed), 0) as total FROM recipes'),
      c.env.DB.prepare('SELECT COALESCE(SUM(ads_detected), 0) as total FROM recipes'),
      c.env.DB.prepare('SELECT ROUND(AVG(total_time)) as total FROM recipes WHERE total_time IS NOT NULL AND total_time > 0'),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM recipes WHERE total_time IS NOT NULL AND total_time <= 20"),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM recipes WHERE total_time IS NOT NULL AND total_time <= 30"),
      c.env.DB.prepare('SELECT COUNT(DISTINCT domain) as total FROM recipes'),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM recipes WHERE original_language IS NOT NULL AND original_language != 'en'"),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM recipes WHERE extracted_at > datetime('now', '-7 days')"),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM recipe_tags WHERE tag = 'vegetarian'"),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM recipe_tags WHERE tag = 'vegan'"),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM recipe_tags WHERE tag IN ('one-pan','one pan','skillet','one-pot','one pot')"),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM recipe_tags WHERE tag IN ('gluten-free','gluten free')"),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM recipe_tags WHERE tag IN ('keto','low-carb','low carb')"),
      c.env.DB.prepare("SELECT COUNT(DISTINCT recipe_id) as total FROM recipe_tags WHERE tag = 'translated'"),
    ]),
    c.env.DB.prepare('SELECT id, title FROM recipes WHERE vote_count >= ? ORDER BY hot_score DESC LIMIT 1')
      .bind(minVotesFeatured)
      .first<{ id: string; title: string }>(),
  ]);

  const getTotal = (r: D1Result | undefined): number =>
    ((r?.results?.[0] as Record<string, number> | undefined)?.total) ?? 0;

  const data = {
    ok: true,
    total_recipes: getTotal(results[0]),
    pending_crawls: getTotal(results[1]),
    failed_crawls: getTotal(results[2]),
    active_domains: getTotal(results[3]),
    total_words_removed: getTotal(results[4]),
    total_ads_removed: getTotal(results[5]),
    avg_cook_time: getTotal(results[6]),
    under_20_min: getTotal(results[7]),
    under_30_min: getTotal(results[8]),
    sources_count: getTotal(results[9]),
    translated_count: getTotal(results[10]),
    new_this_week: getTotal(results[11]),
    vegetarian: getTotal(results[12]),
    vegan: getTotal(results[13]),
    one_pan: getTotal(results[14]),
    gluten_free: getTotal(results[15]),
    keto: getTotal(results[16]),
    translated_recipes: getTotal(results[17]),
    featured_recipe_id: featuredRow?.id ?? null,
    featured_recipe_title: featuredRow?.title ?? null,
  };

  // Store in KV (fire-and-forget)
  try {
    c.executionCtx.waitUntil(
      c.env.CACHE_KV.put(HEALTH_CACHE_KEY, JSON.stringify(data), { expirationTtl: HEALTH_TTL }),
    );
  } catch {
    // No execution context (tests) — skip
  }

  return c.json(data, 200, {
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  });
});

// ── Recipe detail ───────────────────────────────────────────────────────
app.get('/api/v1/recipes/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const value = await c.env.RECIPES_KV.get(`recipe:${id}`, 'text');

  if (value === null) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Recipe not found' } }, 404);
  }

  // Fire-and-forget recipe view tracking + implicit vote for authenticated users
  const userId = c.get('userId');
  if (userId && c.env.USERS_DB) {
    const usersDb = c.env.USERS_DB;
    const recipesDb = c.env.DB;
    const decaySeconds = parseInt(c.env.HOT_DECAY_SECONDS ?? '90000', 10) || 90000;
    const epoch = parseInt(c.env.HOT_EPOCH ?? '1704067200', 10) || 1704067200;
    const viewWeight = parseFloat(c.env.WEIGHT_AUTH_VIEW ?? '0.1') || 0.1;
    try {
      c.executionCtx.waitUntil(
        Promise.all([
          usersDb
            .prepare(
              `INSERT OR IGNORE INTO recipe_views (user_id, recipe_id, source, viewed_date, viewed_at)
               VALUES (?, ?, 'view', date('now'), datetime('now'))`,
            )
            .bind(userId, id)
            .run()
            .catch(() => {}),
          castVote(usersDb, recipesDb, userId, id, 'auth_view', viewWeight, decaySeconds, epoch)
            .catch(() => {}),
        ]),
      );
    } catch {
      // No execution context (e.g. tests) — skip fire-and-forget
    }
  }

  const doc: RecipeDocument = JSON.parse(value);
  return c.json(doc, 200, {
    'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
  });
});

// ── List recipes ─────────────────────────────────────────────────────────
app.get('/api/v1/recipes', optionalAuth, async (c) => {
  const { tag, tags: tagsParam, domain, cuisine, max_time, min_time, cursor, limit: limitParam, sort } = c.req.query();
  const limit = Math.min(Math.max(parseInt(limitParam || '24', 10) || 24, 1), 100);

  // Cold start check for sort=hot: if total votes < threshold, fall back to newest
  const hotMinTotalVotes = parseInt(c.env.HOT_MIN_TOTAL_VOTES ?? '100', 10);
  let effectiveSort = sort ?? '';
  if (sort === 'hot') {
    const totalsRow = await c.env.DB.prepare('SELECT COALESCE(SUM(vote_count), 0) as total FROM recipes').first() as Record<string, number> | null;
    const totalVotes = totalsRow?.total ?? 0;
    if (totalVotes < hotMinTotalVotes) {
      effectiveSort = 'newest';
    }
  }

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

  // Cursor pagination — column depends on sort
  if (cursor) {
    if (effectiveSort === 'hot') {
      conditions.push('r.hot_score < ?');
      params.push(parseFloat(cursor));
    } else if (effectiveSort === 'top') {
      conditions.push('r.vote_count < ?');
      params.push(parseInt(cursor, 10));
    } else {
      conditions.push('r.extracted_at < ?');
      params.push(cursor);
    }
  }

  // Dietary bitmask filtering
  const dietaryMask = await getDietaryMask(c);
  applyDietaryFilter(conditions, params, dietaryMask);

  // Multi-tag filtering: ?tags=vegetarian,one-pan (AND logic — must have ALL tags)
  // Also supports legacy single ?tag=vegetarian
  const tagList = tagsParam ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean) : tag ? [tag] : [];
  let joinClause = '';
  if (tagList.length > 0) {
    // Join recipe_tags once per tag with AND logic
    tagList.forEach((t, i) => {
      const alias = `rt${i}`;
      joinClause += ` JOIN recipe_tags ${alias} ON ${alias}.recipe_id = r.id AND ${alias}.tag = ?`;
      params.push(t);
    });
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Sort options
  const sortMap: Record<string, string> = {
    hot: 'r.hot_score DESC, r.extracted_at DESC',
    top: 'r.vote_count DESC, r.extracted_at DESC',
    rating: 'r.total_time ASC',      // TODO: use avg_rating when Phase 3 lands
    cook_time: 'r.total_time ASC',
    time: 'r.total_time ASC',
    newest: 'r.extracted_at DESC',
  };
  const orderBy = sortMap[effectiveSort] ?? 'r.extracted_at DESC';

  const sql = `SELECT r.id, r.title, r.domain, r.image_url, r.total_time, r.cook_time, r.yields, r.cuisine, r.category, r.extracted_at, r.hot_score, r.vote_count FROM recipes r ${joinClause} ${whereClause} ORDER BY ${orderBy} LIMIT ?`;
  params.push(limit + 1);

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  const rows = result.results || [];

  let next_cursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    const lastRow = rows[rows.length - 1] as Record<string, unknown>;
    if (effectiveSort === 'hot') {
      next_cursor = String(lastRow.hot_score ?? '');
    } else if (effectiveSort === 'top') {
      next_cursor = String(lastRow.vote_count ?? '');
    } else {
      next_cursor = lastRow.extracted_at as string;
    }
  }

  const items = await toRecipeSummaries(c.env.DB, rows as Record<string, unknown>[]);

  return c.json({ items, next_cursor }, 200, {
    'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
  });
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
    'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600',
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
    'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600',
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

  return c.json({ items, next_cursor }, 200, {
    'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
  });
});

// ── Search helpers ────────────────────────────────────────────────────

const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m' as const;
const MIN_SIMILARITY = 0.30;

/** Fetch recipe summaries from D1 by ID list, respecting dietary mask. */
async function fetchRecipesByIds(
  db: D1Database,
  ids: string[],
  dietaryMask: number,
): Promise<RecipeSummary[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const dietaryClause = dietaryMask > 0 ? 'AND (dietary_bitmask & ?) = ?' : '';
  const params: (string | number)[] = [...ids];
  if (dietaryMask > 0) {
    params.push(dietaryMask, dietaryMask);
  }
  const { results } = await db
    .prepare(
      `SELECT id, title, domain, image_url, total_time, cook_time, yields, cuisine, category
       FROM recipes WHERE id IN (${placeholders}) ${dietaryClause}`,
    )
    .bind(...params)
    .all();
  const rows = (results ?? []) as Record<string, unknown>[];
  // Preserve the vector ranking order
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
  return ordered.map((r) => toRecipeSummary(r));
}

/** Post-filter recipe IDs that contain any exclusion ingredient. */
async function filterExclusions(
  db: D1Database,
  ids: string[],
  exclusions: string[],
): Promise<string[]> {
  if (exclusions.length === 0 || ids.length === 0) return ids;
  const placeholders = ids.map(() => '?').join(',');
  const excludedIds = new Set<string>();
  for (const term of exclusions) {
    const { results } = await db
      .prepare(
        `SELECT DISTINCT recipe_id FROM recipe_ingredients
         WHERE recipe_id IN (${placeholders}) AND ingredient LIKE ?`,
      )
      .bind(...ids, `%${term}%`)
      .all();
    for (const row of results ?? []) {
      excludedIds.add((row as { recipe_id: string }).recipe_id);
    }
  }
  return ids.filter((id) => !excludedIds.has(id));
}

/** Embed a query string and return the vector. */
async function embedQuery(ai: Ai, text: string): Promise<number[]> {
  const result = await ai.run(EMBEDDING_MODEL, { text: [text] }) as { data: number[][] };
  return result.data[0] ?? [];
}

/** Run FTS keyword search and return ordered IDs. */
async function keywordSearchIds(
  db: D1Database,
  sanitized: string,
  topK: number,
  dietaryMask: number,
): Promise<string[]> {
  const dietaryClause = dietaryMask > 0 ? 'AND (r.dietary_bitmask & ?3) = ?3' : '';
  const bindParams: (string | number)[] = [sanitized, topK];
  if (dietaryMask > 0) bindParams.push(dietaryMask);
  const { results } = await db
    .prepare(
      `SELECT r.id FROM recipes_fts fts
       JOIN recipes r ON fts.rowid = r.rowid
       WHERE recipes_fts MATCH ?1 ${dietaryClause}
       LIMIT ?2`,
    )
    .bind(...bindParams)
    .all();
  return (results ?? []).map((r) => (r as { id: string }).id);
}

/** Reciprocal rank fusion of two ranked ID lists (k = 60). */
function reciprocalRankFusion(listA: string[], listB: string[], k = 60): string[] {
  const scores = new Map<string, number>();
  for (const [rank, id] of listA.entries()) {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
  }
  for (const [rank, id] of listB.entries()) {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

// ── Search ────────────────────────────────────────────────────────────
app.get('/api/v1/search', optionalAuth, async (c) => {
  const q = c.req.query('q') ?? '';
  const limitParam = c.req.query('limit');
  const offsetParam = c.req.query('offset');
  const limit = Math.min(Math.max(parseInt(limitParam ?? '24', 10) || 24, 1), 50);
  const offset = Math.max(parseInt(offsetParam ?? '0', 10) || 0, 0);
  const mode = (c.req.query('mode') ?? 'keyword') as 'keyword' | 'semantic' | 'hybrid';
  const maxTime = c.req.query('max_time') ? parseInt(c.req.query('max_time')!, 10) : null;
  const tagsParam = c.req.query('tags');
  const tagList = tagsParam ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean) : [];

  if (q.length < 2) {
    return c.json(
      { error: { code: 'INVALID_QUERY', message: 'Query must be at least 2 characters' } },
      400,
    );
  }

  const dietaryMask = await getDietaryMask(c);

  // ── Semantic / Hybrid modes ───────────────────────────────────────
  if (mode === 'semantic' || mode === 'hybrid') {
    if (!c.env.AI || !c.env.VECTORIZE) {
      // Fall through to keyword if bindings unavailable
      return c.json({ items: [], has_more: false, search_mode: mode, error: 'AI or Vectorize not configured' }, 200);
    }

    const { cleanQuery, exclusions } = parseExclusions(q);
    const queryText = cleanQuery || q;

    let vector: number[];
    try {
      vector = await embedQuery(c.env.AI, queryText);
    } catch (err) {
      console.error('embedQuery failed:', err);
      return c.json({ items: [], has_more: false, search_mode: mode }, 200);
    }

    if (vector.length === 0) {
      console.error('embedQuery returned empty vector for:', queryText);
      return c.json({ items: [], has_more: false, search_mode: mode }, 200);
    }

    const vectorMatches = await c.env.VECTORIZE.query(vector, { topK: 50 });
    console.log(`Semantic search: query="${queryText}", matches=${vectorMatches.matches?.length ?? 0}, top_score=${vectorMatches.matches?.[0]?.score ?? 'n/a'}`);
    const semanticIds = (vectorMatches.matches ?? [])
      .filter((m) => m.score >= MIN_SIMILARITY)
      .map((m) => m.id);

    let mergedIds: string[];

    if (mode === 'hybrid') {
      const sanitized = queryText
        .replace(/\b(AND|OR|NOT)\b/g, ' ')
        .replace(/[*"():^~\-:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const kw = sanitized ? await keywordSearchIds(c.env.DB, sanitized, 50, dietaryMask) : [];
      mergedIds = reciprocalRankFusion(kw, semanticIds);
    } else {
      mergedIds = semanticIds;
    }

    const afterExclusions = await filterExclusions(c.env.DB, mergedIds, exclusions);
    const pagedIds = afterExclusions.slice(offset, offset + limit);
    const has_more = afterExclusions.length > offset + limit;

    let filteredIds = pagedIds;
    // Post-filter by max_time and tags for semantic/hybrid
    if (maxTime || tagList.length > 0) {
      const allItems = await fetchRecipesByIds(c.env.DB, afterExclusions, dietaryMask);
      const filtered = allItems.filter((r) => {
        if (maxTime && (r.total_time == null || r.total_time > maxTime)) return false;
        if (tagList.length > 0 && r.tags) {
          for (const t of tagList) {
            if (!r.tags.includes(t)) return false;
          }
        }
        return true;
      });
      const paged = filtered.slice(offset, offset + limit);
      return c.json({ items: paged, has_more: filtered.length > offset + limit, search_mode: mode }, 200, {
        'Cache-Control': 'no-store',
      });
    }

    const items = await fetchRecipesByIds(c.env.DB, filteredIds, dietaryMask);

    return c.json({ items, has_more, search_mode: mode }, 200, {
      'Cache-Control': 'no-store',
    });
  }

  // ── Keyword (default) mode ────────────────────────────────────────
  const sanitized = q.replace(/\b(AND|OR|NOT)\b/g, ' ').replace(/[*"():^~\-:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!sanitized) {
    return c.json({ items: [], next_cursor: null }, 200);
  }

  // Build additional WHERE clauses for time and tag filters
  const extraClauses: string[] = [];
  const extraParams: (string | number)[] = [];
  if (dietaryMask > 0) {
    extraClauses.push('(r.dietary_bitmask & ? ) = ?');
    extraParams.push(dietaryMask, dietaryMask);
  }
  if (maxTime) {
    extraClauses.push('r.total_time IS NOT NULL AND r.total_time <= ?');
    extraParams.push(maxTime);
  }

  let tagJoin = '';
  if (tagList.length > 0) {
    tagList.forEach((t, i) => {
      const alias = `srt${i}`;
      tagJoin += ` JOIN recipe_tags ${alias} ON ${alias}.recipe_id = r.id AND ${alias}.tag = ?`;
      extraParams.push(t);
    });
  }

  const extraWhere = extraClauses.length > 0 ? 'AND ' + extraClauses.join(' AND ') : '';
  const bindParams: (string | number)[] = [sanitized, limit + 1, offset, ...extraParams];

  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.title, r.domain, r.image_url, r.total_time, r.cook_time,
            r.yields, r.cuisine, r.category
     FROM recipes_fts fts
     JOIN recipes r ON fts.rowid = r.rowid
     ${tagJoin}
     WHERE recipes_fts MATCH ?1 ${extraWhere}
     LIMIT ?2 OFFSET ?3`,
  )
    .bind(...bindParams)
    .all();

  const rows = results ?? [];
  const has_more = rows.length > limit;
  if (has_more) rows.pop();

  const items: RecipeSummary[] = rows.map((row: Record<string, unknown>) => toRecipeSummary(row));

  return c.json({ items, has_more, search_mode: 'keyword' }, 200, {
    'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=300',
  });
});

// ── Similar recipes ───────────────────────────────────────────────────
app.get('/api/v1/search/similar/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const limitParam = c.req.query('limit');
  const limit = Math.min(Math.max(parseInt(limitParam ?? '8', 10) || 8, 1), 24);

  if (!c.env.VECTORIZE || !c.env.AI) {
    return c.json({ items: [] }, 200);
  }

  // Fetch the source recipe's vector
  const sourceVectors = await c.env.VECTORIZE.getByIds([id]);
  if (!sourceVectors || sourceVectors.length === 0) {
    return c.json({ items: [] }, 200);
  }

  const sourceVector = sourceVectors[0]!.values;

  // Query nearest neighbours, fetching extra to exclude the source
  const matches = await c.env.VECTORIZE.query(sourceVector, { topK: limit + 1 });
  const similarIds = (matches.matches ?? [])
    .filter((m) => m.id !== id && m.score >= MIN_SIMILARITY)
    .slice(0, limit)
    .map((m) => m.id);

  if (similarIds.length === 0) {
    return c.json({ items: [] }, 200);
  }

  const dietaryMask = await getDietaryMask(c);
  const items = await fetchRecipesByIds(c.env.DB, similarIds, dietaryMask);

  return c.json({ items }, 200, {
    'Cache-Control': 'public, max-age=3600, s-maxage=86400',
  });
});

// ── Robots.txt ────────────────────────────────────────────────────────
app.get('/robots.txt', (c) => {
  return c.text(
    `User-agent: *\nAllow: /\n\nSitemap: https://reduced.recipes/sitemap.xml\n`,
    200,
    { 'Cache-Control': 'public, max-age=86400' },
  );
});

// ── Sitemaps (served from KV, generated by daily cron) ────────────────
function sitemapHandler(kvKey: string) {
  return async (c: { env: { CACHE_KV: KVNamespace }; text: (s: string, status: number) => Response; body: (b: string, status: number, headers: Record<string, string>) => Response }) => {
    const xml = await c.env.CACHE_KV.get(kvKey, 'text');
    if (!xml) return c.text('Not found', 404);
    return c.body(xml, 200, {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    });
  };
}

app.get('/sitemap.xml', sitemapHandler('sitemap:index') as never);
app.get('/sitemap-static.xml', sitemapHandler('sitemap:static') as never);
for (let i = 0; i < 50; i++) {
  app.get(`/sitemap-${i}.xml`, sitemapHandler(`sitemap:chunk:${i}`) as never);
}

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

// ── Admin: Backfill ingredient index ──────────────────────────────────
app.post('/api/v1/admin/backfill-ingredients', async (c) => {
  const authHeader = c.req.header('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token || token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: { code: 401, message: 'Unauthorized' } }, 401);
  }

  const body = await c.req.json<{ cursor?: string; batch_size?: number }>().catch(() => ({} as { cursor?: string; batch_size?: number }));
  const batchSize = Math.min(body.batch_size ?? 200, 500);

  const { extractIngredientNames } = await import('./helpers/ingredient-extract');
  const { chunk } = await import('@rr/shared/utils');

  const opts: KVNamespaceListOptions = { prefix: 'recipe:', limit: batchSize };
  if (body.cursor) opts.cursor = body.cursor;

  const list = await c.env.RECIPES_KV.list(opts);
  let processed = 0;
  let skipped = 0;

  for (const key of list.keys) {
    try {
      const value = await c.env.RECIPES_KV.get(key.name, 'text');
      if (!value) { skipped++; continue; }

      const doc: RecipeDocument = JSON.parse(value);
      if (!doc.ingredients || doc.ingredients.length === 0) { skipped++; continue; }

      const names = extractIngredientNames(doc.ingredients);
      if (names.length === 0) { skipped++; continue; }

      const stmts: D1PreparedStatement[] = [];
      stmts.push(c.env.DB.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').bind(doc.id));

      for (const name of names) {
        stmts.push(
          c.env.DB.prepare(
            'INSERT INTO ingredients (name, count) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET count = count + 1',
          ).bind(name),
        );
        stmts.push(
          c.env.DB.prepare(
            'INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient) VALUES (?, ?)',
          ).bind(doc.id, name),
        );
      }

      const batches = chunk(stmts, 100);
      for (const b of batches) {
        await c.env.DB.batch(b);
      }

      processed++;
    } catch (error) {
      console.error('Backfill failed for', key.name, error);
      skipped++;
    }
  }

  const nextCursor = list.list_complete ? null : list.cursor;

  return c.json({
    ok: true,
    processed,
    skipped,
    next_cursor: nextCursor,
    done: list.list_complete,
  });
});

// ── Backfill nutrition via AI ─────────────────────────────────────────
app.post('/api/v1/admin/backfill-nutrition', async (c) => {
  const authHeader = c.req.header('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token || token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: { code: 401, message: 'Unauthorized' } }, 401);
  }

  if (!c.env.AI) {
    return c.json({ error: { code: 500, message: 'AI binding not available' } }, 500);
  }

  const { estimateNutrition } = await import('./helpers/nutrition-estimate');

  const body = await c.req.json<{ cursor?: string; batch_size?: number }>().catch(() => ({} as { cursor?: string; batch_size?: number }));
  const batchSize = Math.min(body.batch_size ?? 50, 100);

  const opts: KVNamespaceListOptions = { prefix: 'recipe:', limit: batchSize };
  if (body.cursor) opts.cursor = body.cursor;

  const list = await c.env.RECIPES_KV.list(opts);
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const key of list.keys) {
    try {
      const value = await c.env.RECIPES_KV.get(key.name, 'text');
      if (!value) { skipped++; continue; }

      const doc: RecipeDocument = JSON.parse(value);
      if (doc.nutrition) { skipped++; continue; } // Already has nutrition
      if (!doc.ingredients || doc.ingredients.length === 0) { skipped++; continue; }

      const nutrition = await estimateNutrition(doc, c.env.AI);
      if (!nutrition) { skipped++; continue; }

      // Update KV
      doc.nutrition = nutrition;
      await c.env.RECIPES_KV.put(key.name, JSON.stringify(doc), { expirationTtl: 31_536_000 });

      // Update D1
      await c.env.DB.prepare(
        `UPDATE recipes SET calories = ?, protein_g = ?, fat_g = ?, carbs_g = ?,
         fiber_g = ?, sodium_mg = ?, nutrition_source = ? WHERE id = ?`,
      ).bind(
        nutrition.calories, nutrition.protein_g, nutrition.fat_g,
        nutrition.carbs_g, nutrition.fiber_g, nutrition.sodium_mg,
        nutrition.source, doc.id,
      ).run();

      processed++;
    } catch (error) {
      console.error('Nutrition backfill failed for', key.name, error);
      errors++;
    }
  }

  const nextCursor = list.list_complete ? null : list.cursor;

  return c.json({
    ok: true,
    processed,
    skipped,
    errors,
    next_cursor: nextCursor,
    done: list.list_complete,
  });
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
app.route('/', collectionsRoutes);
app.route('/', syncRoutes);
app.route('/', shoppingListRoutes);
app.route('/', ingredientSearchRoutes);
app.route('/', heartRoutes);
app.route('/', fundingRoutes);
app.route('/', searchSimilarRoutes);

// ── Global error handler ────────────────────────────────────────────────
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    500,
  );
});

import { handleIngredientParseQueue } from './helpers/queue-consumer';
import type { IngredientParseJob } from '@rr/shared';

export { ShoppingListDO } from './durable-objects/ShoppingListDO';
export { app };

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<IngredientParseJob>, env: Env) {
    await handleIngredientParseQueue(batch, env);
  },
};
