import { describe, it, expect, vi, beforeEach } from 'vitest';

const FIXED_SLOT_MS = 1_800_000_000_000;
vi.mock('../api/_lib/scheduling', () => ({
  nextPinterestSlot: vi.fn(() => new Date(FIXED_SLOT_MS)),
}));

import { onRequestPost } from '../api/drafts/[id]/edit-approve';

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

function makeCtx(db: D1Database, id: string, body: unknown) {
  return {
    env: { DB: db },
    request: new Request(`https://social-admin.reduced.recipes/api/drafts/${id}/edit-approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: { id },
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response()),
    data: {},
  } as unknown as Parameters<typeof onRequestPost>[0];
}

describe('POST /api/drafts/:id/edit-approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('patches caption + hashtags then flips to scheduled', async () => {
    const { db, runCalls } = makeDb({ updateChanges: 1 });

    const res = await onRequestPost(
      makeCtx(db, 'D1', { caption: 'New caption', hashtags: ['#food', '  #yum  '] }),
    );

    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { ok: boolean; scheduledFor: string };
    expect(body.ok).toBe(true);
    expect(new Date(body.scheduledFor).getTime()).toBe(FIXED_SLOT_MS);

    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]!.sql).toContain('caption = ?');
    expect(runCalls[0]!.sql).toContain('hashtags = ?');
    expect(runCalls[0]!.sql).toContain("status = 'scheduled'");
    expect(runCalls[0]!.sql).toContain("WHERE id = ? AND status = 'pending_approval'");

    expect(runCalls[0]!.bindings[0]).toBe('New caption');
    expect(JSON.parse(runCalls[0]!.bindings[1] as string)).toEqual(['#food', '#yum']);
    expect(runCalls[0]!.bindings[3]).toBe(FIXED_SLOT_MS);
    // last binding is the id
    expect(runCalls[0]!.bindings[runCalls[0]!.bindings.length - 1]).toBe('D1');
  });

  it('proceeds with no caption/hashtags patch (just schedule)', async () => {
    const { db, runCalls } = makeDb({ updateChanges: 1 });
    const res = await onRequestPost(makeCtx(db, 'D1', {}));
    expect(res!.status).toBe(200);
    expect(runCalls[0]!.sql).toContain("status = 'scheduled'");
    expect(runCalls[0]!.sql).not.toContain('caption = ?');
    expect(runCalls[0]!.sql).not.toContain('hashtags = ?');
  });

  it('returns 409 when no rows change', async () => {
    const { db } = makeDb({ updateChanges: 0 });
    const res = await onRequestPost(makeCtx(db, 'D1', { caption: 'x' }));
    expect(res!.status).toBe(409);
  });

  it('returns 400 on invalid JSON body', async () => {
    const { db } = makeDb({});
    const ctx = {
      env: { DB: db },
      request: new Request('https://social-admin.reduced.recipes/api/drafts/D1/edit-approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      }),
      params: { id: 'D1' },
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response()),
      data: {},
    } as unknown as Parameters<typeof onRequestPost>[0];
    const res = await onRequestPost(ctx);
    expect(res!.status).toBe(400);
  });
});
