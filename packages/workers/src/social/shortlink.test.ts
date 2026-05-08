import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stable ulid so we can assert hit-row bindings deterministically.
vi.mock('@rr/social-shared', async () => {
  const actual = await vi.importActual<typeof import('@rr/social-shared')>('@rr/social-shared');
  return {
    ...actual,
    ulid: () => 'HIT_01',
    recipePageUrl: (id: string) => `https://reduced.recipes/recipe/${id}`,
  };
});

// Force scheduling.nextPinterestSlot to a fixed Date so the approve path's
// SQL bindings are deterministic.
const FIXED_SLOT_MS = 1_800_000_000_000;
vi.mock('./scheduling', () => ({
  nextPinterestSlot: vi.fn(() => new Date(FIXED_SLOT_MS)),
}));

import shortlink from './shortlink';

// ── D1 test double ──────────────────────────────────────────────────────

interface CapturedBind {
  sql: string;
  bindings: unknown[];
}

interface DbCanned {
  draft?: { id: string; status: string; cta_url: string | null; source_id: string } | null;
  candidate?: { recipe_id: string } | null;
  /** Number of rows changed by an UPDATE — defaults to 1. */
  updateChanges?: number;
}

function makeDb(canned: DbCanned) {
  const allBindCalls: CapturedBind[] = [];
  const runCalls: { sql: string; bindings: unknown[] }[] = [];
  const firstCalls: { sql: string; bindings: unknown[] }[] = [];

  const prepare = vi.fn((sql: string) => {
    let pendingBindings: unknown[] = [];
    const handle = {
      bind: vi.fn((...bindings: unknown[]) => {
        pendingBindings = bindings;
        allBindCalls.push({ sql, bindings });
        return handle;
      }),
      first: vi.fn(async <T,>() => {
        firstCalls.push({ sql, bindings: pendingBindings });
        if (sql.includes('FROM social_drafts')) {
          return (canned.draft ?? null) as T | null;
        }
        if (sql.includes('FROM social_source_candidates')) {
          return (canned.candidate ?? null) as T | null;
        }
        return null;
      }),
      run: vi.fn(async () => {
        runCalls.push({ sql, bindings: pendingBindings });
        const changes = sql.trim().toUpperCase().startsWith('UPDATE')
          ? (canned.updateChanges ?? 1)
          : 0;
        return { success: true, meta: { changes } } as unknown as D1Result;
      }),
    };
    return handle;
  });

  return {
    db: { prepare } as unknown as D1Database,
    allBindCalls,
    runCalls,
    firstCalls,
  };
}

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new Request(`https://r.reduced.recipes${path}`, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rr-social-shortlink', () => {
  // ── /:draftId — public hit + 302 redirect ─────────────────────────────

  describe('hit (GET /:draftId)', () => {
    it('redirects to cta_url, logs the hit with cf headers', async () => {
      const { db, allBindCalls, runCalls } = makeDb({
        draft: {
          id: 'DRAFT_A',
          status: 'published',
          cta_url: 'https://reduced.recipes/recipe/r1?utm_source=pinterest',
          source_id: 'CAND_A',
        },
      });
      const env = { DB: db };
      const req = makeRequest('/DRAFT_A', {
        'cf-ipcountry': 'US',
        referer: 'https://www.pinterest.com/',
        'user-agent': 'Mozilla/5.0',
      });

      const res = await shortlink.fetch(req, env);

      // 302 with Location header pointing at cta_url.
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(
        'https://reduced.recipes/recipe/r1?utm_source=pinterest',
      );

      // SELECT social_drafts came first.
      expect(allBindCalls[0]!.sql).toContain('FROM social_drafts');
      expect(allBindCalls[0]!.bindings).toEqual(['DRAFT_A']);

      // Single INSERT into social_shortlink_hits.
      const inserts = runCalls.filter((c) => c.sql.includes('INSERT INTO social_shortlink_hits'));
      expect(inserts).toHaveLength(1);
      expect(inserts[0]!.bindings).toEqual([
        'HIT_01',
        'DRAFT_A',
        expect.any(Number),
        'US',
        'https://www.pinterest.com/',
        'Mozilla/5.0',
      ]);
    });

    it('falls back to recipePageUrl when cta_url is missing', async () => {
      const { db, runCalls } = makeDb({
        draft: { id: 'DRAFT_B', status: 'pending_approval', cta_url: null, source_id: 'CAND_B' },
        candidate: { recipe_id: 'r99' },
      });
      const env = { DB: db };

      const res = await shortlink.fetch(makeRequest('/DRAFT_B'), env);

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://reduced.recipes/recipe/r99');

      // Confirm the candidate lookup actually fired before the redirect.
      expect(runCalls.find((c) => c.sql.includes('INSERT INTO social_shortlink_hits')))
        .toBeDefined();
    });

    it('falls back when cta_url self-references r.reduced.recipes', async () => {
      const { db } = makeDb({
        draft: {
          id: 'DRAFT_C',
          status: 'pending_approval',
          cta_url: 'https://r.reduced.recipes/DRAFT_C',
          source_id: 'CAND_C',
        },
        candidate: { recipe_id: 'r42' },
      });

      const res = await shortlink.fetch(makeRequest('/DRAFT_C'), { DB: db });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://reduced.recipes/recipe/r42');
    });

    it('writes nulls for absent cf headers', async () => {
      const { db, runCalls } = makeDb({
        draft: {
          id: 'DRAFT_D',
          status: 'published',
          cta_url: 'https://reduced.recipes/recipe/r1',
          source_id: 'CAND_D',
        },
      });

      await shortlink.fetch(makeRequest('/DRAFT_D'), { DB: db });

      const insert = runCalls.find((c) => c.sql.includes('INSERT INTO social_shortlink_hits'));
      expect(insert).toBeDefined();
      // Bindings: id, draft_id, hit_at, country, referer, user_agent.
      expect(insert!.bindings.slice(3)).toEqual([null, null, null]);
    });

    it('returns 404 when draft does not exist', async () => {
      const { db, runCalls } = makeDb({ draft: null });
      const res = await shortlink.fetch(makeRequest('/UNKNOWN'), { DB: db });

      expect(res.status).toBe(404);
      // No hit row written for unknown draft.
      expect(runCalls.find((c) => c.sql.includes('INSERT INTO social_shortlink_hits')))
        .toBeUndefined();
    });
  });

  // ── /approve/:draftId — CF Access in production ──────────────────────

  describe('approve (GET /approve/:draftId)', () => {
    it('schedules a pending_approval draft and returns success page', async () => {
      const { db, runCalls } = makeDb({
        draft: { id: 'DRAFT_E', status: 'pending_approval', cta_url: null, source_id: 'CAND_E' },
      });

      const res = await shortlink.fetch(makeRequest('/approve/DRAFT_E'), { DB: db });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/html');
      const body = await res.text();
      expect(body).toContain('Approved');

      // Exactly one UPDATE, with correct columns set.
      const updates = runCalls.filter((c) => c.sql.includes('UPDATE social_drafts'));
      expect(updates).toHaveLength(1);
      expect(updates[0]!.sql).toContain("status = 'scheduled'");
      expect(updates[0]!.sql).toContain('approved_at = ?');
      expect(updates[0]!.sql).toContain('scheduled_for = ?');
      expect(updates[0]!.sql).toContain("AND status = 'pending_approval'");
      // Bindings: approved_at (now ms), scheduled_for (FIXED_SLOT_MS), draft_id.
      expect(updates[0]!.bindings).toEqual([
        expect.any(Number),
        FIXED_SLOT_MS,
        'DRAFT_E',
      ]);
    });

    it('is idempotent: already-approved draft returns 200 "Already approved" without UPDATE', async () => {
      const { db, runCalls } = makeDb({
        draft: { id: 'DRAFT_F', status: 'approved', cta_url: null, source_id: 'CAND_F' },
      });

      const res = await shortlink.fetch(makeRequest('/approve/DRAFT_F'), { DB: db });

      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Already approved');
      // Critical: no UPDATE fires on an already-decided draft.
      expect(runCalls.find((c) => c.sql.includes('UPDATE social_drafts'))).toBeUndefined();
    });

    it('is idempotent: already-scheduled draft also returns 200 without UPDATE', async () => {
      const { db, runCalls } = makeDb({
        draft: { id: 'DRAFT_G', status: 'scheduled', cta_url: null, source_id: 'CAND_G' },
      });

      const res = await shortlink.fetch(makeRequest('/approve/DRAFT_G'), { DB: db });

      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Already approved');
      expect(runCalls.find((c) => c.sql.includes('UPDATE social_drafts'))).toBeUndefined();
    });

    it('refuses to approve from a non-pending status with 409', async () => {
      const { db, runCalls } = makeDb({
        draft: { id: 'DRAFT_H', status: 'rejected', cta_url: null, source_id: 'CAND_H' },
      });

      const res = await shortlink.fetch(makeRequest('/approve/DRAFT_H'), { DB: db });

      expect(res.status).toBe(409);
      expect(await res.text()).toContain("'rejected'");
      expect(runCalls.find((c) => c.sql.includes('UPDATE social_drafts'))).toBeUndefined();
    });

    it('returns 404 for unknown draft id', async () => {
      const { db, runCalls } = makeDb({ draft: null });

      const res = await shortlink.fetch(makeRequest('/approve/UNKNOWN'), { DB: db });

      expect(res.status).toBe(404);
      expect(runCalls).toHaveLength(0);
    });
  });

  // ── /reject/:draftId — CF Access in production ───────────────────────

  describe('reject (GET /reject/:draftId)', () => {
    it('rejects a pending_approval draft with rejection_reason', async () => {
      const { db, runCalls } = makeDb({
        draft: { id: 'DRAFT_I', status: 'pending_approval', cta_url: null, source_id: 'CAND_I' },
        updateChanges: 1,
      });

      const res = await shortlink.fetch(makeRequest('/reject/DRAFT_I'), { DB: db });

      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Rejected');

      const updates = runCalls.filter((c) => c.sql.includes('UPDATE social_drafts'));
      expect(updates).toHaveLength(1);
      expect(updates[0]!.sql).toContain("status = 'rejected'");
      expect(updates[0]!.sql).toContain("rejection_reason = 'one-click reject from email'");
      expect(updates[0]!.sql).toContain("AND status = 'pending_approval'");
      expect(updates[0]!.bindings).toEqual(['DRAFT_I']);
    });

    it('is idempotent: already-rejected draft returns 409 "Already decided"', async () => {
      // Draft exists but status != pending_approval, so the conditional UPDATE
      // matches zero rows (meta.changes === 0).
      const { db } = makeDb({
        draft: { id: 'DRAFT_J', status: 'rejected', cta_url: null, source_id: 'CAND_J' },
        updateChanges: 0,
      });

      const res = await shortlink.fetch(makeRequest('/reject/DRAFT_J'), { DB: db });

      expect(res.status).toBe(409);
      expect(await res.text()).toBe('Already decided');
    });

    it('returns 404 for unknown draft id', async () => {
      const { db, runCalls } = makeDb({ draft: null });

      const res = await shortlink.fetch(makeRequest('/reject/UNKNOWN'), { DB: db });

      expect(res.status).toBe(404);
      expect(runCalls.find((c) => c.sql.includes('UPDATE social_drafts'))).toBeUndefined();
    });
  });

  // ── unknown URL shapes ───────────────────────────────────────────────

  describe('unknown route', () => {
    it('returns 404 for the bare root', async () => {
      const { db } = makeDb({ draft: null });
      const res = await shortlink.fetch(makeRequest('/'), { DB: db });
      expect(res.status).toBe(404);
    });

    it('returns 404 for three-segment paths', async () => {
      const { db } = makeDb({ draft: null });
      const res = await shortlink.fetch(makeRequest('/foo/bar/baz'), { DB: db });
      expect(res.status).toBe(404);
    });

    it('returns 404 for unknown two-segment prefix', async () => {
      const { db } = makeDb({ draft: null });
      const res = await shortlink.fetch(makeRequest('/delete/DRAFT_X'), { DB: db });
      expect(res.status).toBe(404);
    });
  });
});

// ── scheduling.nextPinterestSlot — small smoke test for ticket 011 import ──
describe('nextPinterestSlot', () => {
  it('exports a function importable by ticket 011', async () => {
    // Re-import without the test-level mock; .unstable_resetModules() not
    // needed because the mock above uses `vi.mock()` at module scope.
    // We just confirm the symbol exists and returns a Date when called via
    // the real module (this file's mock applies only inside the describe
    // blocks above when shortlink.ts imports './scheduling').
    const real = await vi.importActual<typeof import('./scheduling')>('./scheduling');
    expect(typeof real.nextPinterestSlot).toBe('function');
    const slot = real.nextPinterestSlot(new Date('2026-05-06T00:00:00Z'));
    expect(slot).toBeInstanceOf(Date);
    expect(slot.getTime()).toBeGreaterThan(new Date('2026-05-06T00:00:00Z').getTime());
  });
});
