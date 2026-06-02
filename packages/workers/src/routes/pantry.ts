import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import { isPantryState, emptyPantryState, type PantryState } from '@rr/shared/pantry';
import { requireAuth } from '../middleware/auth';

type AuthEnv = { Bindings: Env; Variables: { userId: string } };
const pantry = new Hono<AuthEnv>();

const PANTRY_LIMIT = 100;

function normalise(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = raw.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= PANTRY_LIMIT) break;
  }
  return out;
}

function kvKey(userId: string): string {
  return `pantry:${userId}`;
}

pantry.get('/api/v1/me/pantry', requireAuth, async (c) => {
  const userId = c.get('userId');
  const kv = c.env.USER_CACHE_KV;
  if (!kv) return c.json({ pantry: emptyPantryState() });

  const raw = await kv.get(kvKey(userId));
  if (!raw) return c.json({ pantry: emptyPantryState() });

  try {
    const parsed = JSON.parse(raw);
    if (isPantryState(parsed)) return c.json({ pantry: parsed });
  } catch {
    // fall through
  }
  return c.json({ pantry: emptyPantryState() });
});

pantry.put('/api/v1/me/pantry', requireAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ pantry?: unknown }>().catch(() => ({}));
  if (!isPantryState(body.pantry)) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'pantry must be { have: string[], exclude: string[] }' } }, 400);
  }

  const next: PantryState = {
    have: normalise(body.pantry.have),
    exclude: normalise(body.pantry.exclude),
  };

  const kv = c.env.USER_CACHE_KV;
  if (kv) await kv.put(kvKey(userId), JSON.stringify(next));

  return c.json({ pantry: next });
});

export default pantry;
