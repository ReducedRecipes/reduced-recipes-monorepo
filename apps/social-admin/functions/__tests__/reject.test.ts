import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost } from '../api/drafts/[id]/reject';

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

function makeCtx(db: D1Database, id: string, body?: unknown) {
  const init: RequestInit =
    body !== undefined
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : { method: 'POST' };
  return {
    env: { DB: db },
    request: new Request(`https://social-admin.reduced.recipes/api/drafts/${id}/reject`, init),
    params: { id },
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response()),
    data: {},
  } as unknown as Parameters<typeof onRequestPost>[0];
}

describe('POST /api/drafts/:id/reject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flips pending_approval -> rejected with default reason', async () => {
    const { db, runCalls } = makeDb({ updateChanges: 1 });

    const res = await onRequestPost(makeCtx(db, 'D1'));
    expect(res!.status).toBe(200);

    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]!.sql).toContain("SET status = 'rejected'");
    expect(runCalls[0]!.sql).toContain("WHERE id = ? AND status = 'pending_approval'");
    expect(runCalls[0]!.bindings[0]).toBe('rejected via swipe admin');
    expect(runCalls[0]!.bindings[1]).toBe('D1');
  });

  it('uses provided reason when present in JSON body', async () => {
    const { db, runCalls } = makeDb({ updateChanges: 1 });
    await onRequestPost(makeCtx(db, 'D1', { reason: 'off-brand' }));
    expect(runCalls[0]!.bindings[0]).toBe('off-brand');
  });

  it('returns 409 when nothing changes (already decided)', async () => {
    const { db } = makeDb({ updateChanges: 0 });
    const res = await onRequestPost(makeCtx(db, 'D2'));
    expect(res!.status).toBe(409);
  });

  it('survives malformed JSON body and uses default reason', async () => {
    const { db, runCalls } = makeDb({ updateChanges: 1 });
    const ctx = {
      env: { DB: db },
      request: new Request('https://social-admin.reduced.recipes/api/drafts/D3/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      }),
      params: { id: 'D3' },
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response()),
      data: {},
    } as unknown as Parameters<typeof onRequestPost>[0];
    const res = await onRequestPost(ctx);
    expect(res!.status).toBe(200);
    expect(runCalls[0]!.bindings[0]).toBe('rejected via swipe admin');
  });
});
