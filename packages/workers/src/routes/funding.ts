/**
 * Funding & transparency routes.
 *
 * GET  /api/v1/funding           — Public funding summary (costs, donations, progress)
 * POST /api/v1/funding/kofi      — Ko-fi webhook (receives donation notifications)
 * POST /api/v1/funding/costs     — Admin: update monthly costs
 */

import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import type { User } from '@rr/shared';

type AppBindings = { Bindings: Env; Variables: { userId?: string; user?: User } };

const funding = new Hono<AppBindings>();

// ── GET /api/v1/funding ──────────────────────────────────────────────────
funding.get('/api/v1/funding', async (c) => {
  const db = c.env.FUNDING_DB;
  if (!db) {
    return c.json({ error: { code: 'NOT_CONFIGURED', message: 'Funding DB not configured' } }, 500);
  }

  // Get current month and last 6 months of costs
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [costsResult, donationsThisMonth, donationsAllTime, recentDonations] = await Promise.all([
    db.prepare('SELECT * FROM monthly_costs ORDER BY month DESC LIMIT 6').all(),
    db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM donations WHERE created_at >= date('now', 'start of month')",
    ).first<{ total: number }>(),
    db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM donations').first<{ total: number }>(),
    db.prepare(
      'SELECT name, amount, message, created_at FROM donations ORDER BY created_at DESC LIMIT 10',
    ).all(),
  ]);

  const costs = (costsResult.results ?? []) as Record<string, unknown>[];
  const currentCosts = costs.find((r) => r.month === currentMonth) ?? costs[0];

  return c.json({
    current_month: currentMonth,
    monthly_cost: (currentCosts?.total as number) ?? 0,
    cost_breakdown: currentCosts ?? null,
    cost_history: costs,
    funded_this_month: donationsThisMonth?.total ?? 0,
    funded_all_time: donationsAllTime?.total ?? 0,
    recent_donations: (recentDonations.results ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        name: row.name ?? 'Anonymous',
        amount: row.amount as number,
        message: row.message ?? null,
        created_at: row.created_at as string,
      };
    }),
  }, 200, {
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  });
});

// ── POST /api/v1/funding/kofi ────────────────────────────────────────────
funding.post('/api/v1/funding/kofi', async (c) => {
  const db = c.env.FUNDING_DB;
  if (!db) {
    return c.json({ error: { code: 'NOT_CONFIGURED', message: 'Funding DB not configured' } }, 500);
  }

  // Ko-fi sends data as form-encoded with a 'data' field containing JSON
  const body = await c.req.parseBody();
  const dataStr = body.data as string;

  if (!dataStr) {
    return c.json({ error: { code: 'INVALID_PAYLOAD', message: 'Missing data field' } }, 400);
  }

  let payload: {
    verification_token: string;
    message_id: string;
    type: string;
    from_name: string;
    email: string;
    amount: string;
    currency: string;
    message: string;
    is_public: boolean;
  };

  try {
    payload = JSON.parse(dataStr);
  } catch {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON in data field' } }, 400);
  }

  // Verify the token if configured
  const verificationToken = c.env.KOFI_VERIFICATION_TOKEN;
  if (verificationToken && payload.verification_token !== verificationToken) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid verification token' } }, 401);
  }

  // Only process donations and subscriptions
  if (payload.type !== 'Donation' && payload.type !== 'Subscription') {
    return c.json({ ok: true, skipped: true });
  }

  const id = crypto.randomUUID();
  const amount = parseFloat(payload.amount);

  if (isNaN(amount) || amount <= 0) {
    return c.json({ ok: true, skipped: true });
  }

  await db.prepare(
    `INSERT INTO donations (id, email, name, amount, currency, message, source, kofi_transaction_id)
     VALUES (?, ?, ?, ?, ?, ?, 'kofi', ?)
     ON CONFLICT(kofi_transaction_id) DO NOTHING`,
  ).bind(
    id,
    payload.email ?? null,
    payload.is_public ? payload.from_name : null,
    amount,
    payload.currency ?? 'USD',
    payload.is_public ? (payload.message || null) : null,
    payload.message_id,
  ).run();

  return c.json({ ok: true });
});

// ── POST /api/v1/funding/costs ───────────────────────────────────────────
funding.post('/api/v1/funding/costs', async (c) => {
  const authHeader = c.req.header('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token || token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: { code: 401, message: 'Unauthorized' } }, 401);
  }

  const db = c.env.FUNDING_DB;
  if (!db) {
    return c.json({ error: { code: 'NOT_CONFIGURED', message: 'Funding DB not configured' } }, 500);
  }

  const body = await c.req.json<{
    month: string;
    d1_reads?: number;
    workers_ai?: number;
    queues?: number;
    kv?: number;
    durable_objects?: number;
    r2?: number;
    workers_base?: number;
    other?: number;
    notes?: string;
  }>();

  if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'month must be YYYY-MM format' } }, 400);
  }

  const d1 = body.d1_reads ?? 0;
  const ai = body.workers_ai ?? 0;
  const queues = body.queues ?? 0;
  const kv = body.kv ?? 0;
  const durable = body.durable_objects ?? 0;
  const r2 = body.r2 ?? 0;
  const base = body.workers_base ?? 5;
  const other = body.other ?? 0;
  const total = d1 + ai + queues + kv + durable + r2 + base + other;

  await db.prepare(
    `INSERT INTO monthly_costs (month, d1_reads, workers_ai, queues, kv, durable_objects, r2, workers_base, other, total, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET
       d1_reads = excluded.d1_reads,
       workers_ai = excluded.workers_ai,
       queues = excluded.queues,
       kv = excluded.kv,
       durable_objects = excluded.durable_objects,
       r2 = excluded.r2,
       workers_base = excluded.workers_base,
       other = excluded.other,
       total = excluded.total,
       notes = excluded.notes,
       updated_at = datetime('now')`,
  ).bind(body.month, d1, ai, queues, kv, durable, r2, base, other, total, body.notes ?? null).run();

  return c.json({ ok: true, month: body.month, total });
});

export default funding;
