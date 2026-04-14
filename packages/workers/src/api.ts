import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, RecipeDocument } from '@rr/shared';

const app = new Hono<{ Bindings: Env }>();

// ── CORS ────────────────────────────────────────────────────────────────
app.use(
  '*',
  cors({
    origin: ['https://reducedrecipes.com', 'http://localhost:5173'],
    allowMethods: ['GET', 'POST'],
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
app.get('/api/v1/recipes/:id', async (c) => {
  const id = c.req.param('id');
  const value = await c.env.RECIPES_KV.get(`recipe:${id}`, 'text');

  if (value === null) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Recipe not found' } }, 404);
  }

  const doc: RecipeDocument = JSON.parse(value);
  return c.json(doc, 200, {
    'Cache-Control': 'public, max-age=3600, s-maxage=86400',
  });
});

// ── Global error handler ────────────────────────────────────────────────
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: err.message } },
    500,
  );
});

export default app;
