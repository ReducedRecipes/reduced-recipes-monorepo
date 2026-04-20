import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import type { User } from '@rr/shared';
import { requireAuth } from '../middleware/auth';
import { updateHotScore, castVote } from '../helpers/hot-score';

type AuthEnv = { Bindings: Env; Variables: { userId: string; user: User } };

const hearts = new Hono<AuthEnv>();

const DEFAULT_RATE_LIMIT = 100;
const DEFAULT_DECAY_SECONDS = 90000;
const DEFAULT_EPOCH = 1704067200;

function getDecaySeconds(env: Env): number {
  return parseInt(env.HOT_DECAY_SECONDS ?? String(DEFAULT_DECAY_SECONDS), 10) || DEFAULT_DECAY_SECONDS;
}

function getEpoch(env: Env): number {
  return parseInt(env.HOT_EPOCH ?? String(DEFAULT_EPOCH), 10) || DEFAULT_EPOCH;
}

/** Check and increment daily heart rate limit. Returns false if limit exceeded. */
async function checkRateLimit(
  kv: KVNamespace | undefined,
  userId: string,
  limitPerDay: number,
): Promise<boolean> {
  if (!kv) return true; // No KV configured — allow (non-prod)

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `heart-rate:${userId}:${today}`;

  const current = await kv.get(key);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= limitPerDay) return false;

  // Increment, TTL until end of day (at most 86400s)
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  const ttl = Math.ceil((midnight.getTime() - now.getTime()) / 1000);

  await kv.put(key, String(count + 1), { expirationTtl: Math.max(ttl, 1) });
  return true;
}

// POST /api/v1/recipes/:id/heart — heart a recipe
hearts.post('/api/v1/recipes/:id/heart', requireAuth, async (c) => {
  const userId = c.get('userId');
  const recipeId = c.req.param('id');
  const env = c.env;

  if (!env.USERS_DB) {
    return c.json({ error: { code: 'server_error', message: 'Not configured' } }, 500);
  }

  // Check recipe exists
  const recipe = await env.DB.prepare('SELECT id FROM recipes WHERE id = ?')
    .bind(recipeId)
    .first();
  if (!recipe) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Recipe not found' } }, 404);
  }

  // Check if already hearted
  const existing = await env.USERS_DB.prepare(
    `SELECT 1 FROM recipe_votes WHERE user_id = ? AND recipe_id = ? AND action = 'heart'`,
  )
    .bind(userId, recipeId)
    .first();
  if (existing) {
    const voteCount = await env.DB.prepare('SELECT vote_count FROM recipes WHERE id = ?')
      .bind(recipeId)
      .first<{ vote_count: number }>();
    return c.json({ hearted: true, vote_count: voteCount?.vote_count ?? 0 });
  }

  // Rate limit
  const limitPerDay =
    parseInt(env.HOT_RATE_LIMIT_PER_DAY ?? String(DEFAULT_RATE_LIMIT), 10) || DEFAULT_RATE_LIMIT;
  const allowed = await checkRateLimit(env.VOTES_KV, userId, limitPerDay);
  if (!allowed) {
    return c.json(
      { error: { code: 'RATE_LIMITED', message: 'Heart rate limit exceeded (100/day)' } },
      429,
    );
  }

  const weight = parseFloat(env.WEIGHT_HEART ?? '1.0') || 1.0;
  const voteCount = await castVote(
    env.USERS_DB,
    env.DB,
    userId,
    recipeId,
    'heart',
    weight,
    getDecaySeconds(env),
    getEpoch(env),
  );

  return c.json({ hearted: true, vote_count: voteCount }, 201);
});

// DELETE /api/v1/recipes/:id/heart — un-heart a recipe
hearts.delete('/api/v1/recipes/:id/heart', requireAuth, async (c) => {
  const userId = c.get('userId');
  const recipeId = c.req.param('id');
  const env = c.env;

  if (!env.USERS_DB) {
    return c.json({ error: { code: 'server_error', message: 'Not configured' } }, 500);
  }

  await env.USERS_DB.prepare(
    `DELETE FROM recipe_votes WHERE user_id = ? AND recipe_id = ? AND action = 'heart'`,
  )
    .bind(userId, recipeId)
    .run();

  await updateHotScore(env.USERS_DB, env.DB, recipeId, getDecaySeconds(env), getEpoch(env));

  const row = await env.DB.prepare('SELECT vote_count FROM recipes WHERE id = ?')
    .bind(recipeId)
    .first<{ vote_count: number }>();

  return c.json({ hearted: false, vote_count: row?.vote_count ?? 0 });
});

// GET /api/v1/recipes/:id/heart — check if current user hearted
hearts.get('/api/v1/recipes/:id/heart', requireAuth, async (c) => {
  const userId = c.get('userId');
  const recipeId = c.req.param('id');
  const env = c.env;

  if (!env.USERS_DB) {
    return c.json({ error: { code: 'server_error', message: 'Not configured' } }, 500);
  }

  const row = await env.USERS_DB.prepare(
    `SELECT 1 FROM recipe_votes WHERE user_id = ? AND recipe_id = ? AND action = 'heart'`,
  )
    .bind(userId, recipeId)
    .first();

  return c.json({ hearted: row !== null });
});

export default hearts;
