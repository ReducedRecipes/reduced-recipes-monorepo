import { describe, it, expect, vi, beforeEach } from 'vitest';

const FIXED_SLOT_MS = 1_800_000_000_000;
vi.mock('../api/_lib/scheduling', () => ({
  nextPinterestSlot: vi.fn(() => new Date(FIXED_SLOT_MS)),
}));

import { onRequestPost } from '../api/drafts/[id]/approve';

interface DbCanned {
  updateChanges?: number;
}

function makeDb(canned: DbCanned) {
  const runCalls: { sql: string; bindings: unknown[] }[] = [];

  const prepare = vi.fn((sql: string) => {
    let pendingBindings: unknown[] = [];
    const handle = {
      bind: vi.fn((...bindings: unknown[]) => {
        pendingBindings = bindings;
        return handle;
      }),
      run: vi.fn(async () => {
        runCalls.push({ sql, bindings: pendingBindings });
        return {
          success: true,
          meta: { changes: canned.updateChanges ?? 1 },
        } as unknown as D1Result;
      }),
    };
    return handle;
  });

  return { db: { prepare } as unknown as D1Database, runCalls };
}

function makeCtx(db: D1Database, id: string) {
  return {
    env: { DB: db },
    request: new Request(`https://social-admin.reduced.recipes/api/drafts/${id}/approve`, {
      method: 'POST',
    }),
    params: { id },
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response()),
    data: {},
  } as unknown as Parameters<typeof onRequestPost>[0];
}

describe('POST /api/drafts/:id/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flips pending_approval -> scheduled with scheduled_for set', async () => {
    const { db, runCalls } = makeDb({ updateChanges: 1 });

    const res = await onRequestPost(makeCtx(db, 'D1'));
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { ok: boolean; scheduledFor: string };
    expect(body.ok).toBe(true);
    expect(new Date(body.scheduledFor).getTime()).toBe(FIXED_SLOT_MS);

    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]!.sql).toContain("SET status = 'scheduled'");
    expect(runCalls[0]!.sql).toContain("WHERE id = ? AND status = 'pending_approval'");
    expect(runCalls[0]!.bindings[1]).toBe(FIXED_SLOT_MS);
    expect(runCalls[0]!.bindings[2]).toBe('D1');
  });

  it('returns 409 when no rows change (already decided)', async () => {
    const { db } = makeDb({ updateChanges: 0 });
    const res = await onRequestPost(makeCtx(db, 'D2'));
    expect(res!.status).toBe(409);
  });

  it('returns 400 for missing id param', async () => {
    const { db } = makeDb({ updateChanges: 0 });
    const ctx = makeCtx(db, '');
    // Override with empty id
    (ctx as unknown as { params: { id: string } }).params.id = '';
    const res = await onRequestPost(ctx);
    expect(res!.status).toBe(400);
  });
});
