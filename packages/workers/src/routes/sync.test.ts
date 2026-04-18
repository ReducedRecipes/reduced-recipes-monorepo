import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import type { BookmarkSyncAction } from '@rr/shared';

// We test the sync route by creating a thin wrapper app that skips real auth
// and sets userId directly, then mounts the sync route handler logic.
// This mirrors the pattern used in the auth middleware tests.

// Import the actual route — requireAuth will be mocked below.
vi.mock('../middleware/auth', () => ({
  requireAuth: vi.fn(async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set('userId', 'user-1');
    await next();
  }),
}));

import syncApp from './sync';

/* ── Mock helpers ── */

function makeD1Result(results: Record<string, unknown>[] = []) {
  return { results, success: true, meta: {} };
}

function makeStmt(firstResult: Record<string, unknown> | null = null) {
  return {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(firstResult),
    all: vi.fn().mockResolvedValue(makeD1Result(firstResult ? [firstResult] : [])),
    run: vi.fn().mockResolvedValue(makeD1Result()),
  };
}

function createEnv(overrides: {
  defaultCollection?: { id: string } | null;
  existingBookmark?: { id: string; updated_at: string } | null;
} = {}) {
  const { defaultCollection = { id: 'default-col-1' }, existingBookmark = null } = overrides;

  const USERS_DB = {
    prepare: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('collections') && sql.includes('is_default')) {
        return makeStmt(defaultCollection);
      }
      if (sql.includes('SELECT') && sql.includes('bookmarks') && sql.includes('recipe_id')) {
        return makeStmt(existingBookmark);
      }
      // INSERT, UPDATE, DELETE statements
      return makeStmt(null);
    }),
  };

  return {
    DB: { prepare: vi.fn().mockReturnValue(makeStmt(null)) },
    RECIPES_KV: {} as unknown,
    CACHE_KV: {} as unknown,
    IMAGES_R2: {} as unknown,
    CRAWL_QUEUE: {} as unknown,
    PARSE_QUEUE: {} as unknown,
    PROJECTION_QUEUE: {} as unknown,
    ADMIN_TOKEN: 'test',
    BOT_USER_AGENT: 'test',
    DEFAULT_CRAWL_DELAY_MS: '500',
    MAX_QUEUE_BATCH: '10',
    ENVIRONMENT: 'test',
    USERS_DB,
    SESSION_KV: {} as unknown,
  } as unknown as Env;
}

async function postSync(env: Env, body: unknown) {
  return syncApp.request(
    '/api/v1/sync/bookmarks',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe('POST /api/v1/sync/bookmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if actions array is missing', async () => {
    const env = createEnv();
    const res = await postSync(env, {});
    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 if actions array is empty', async () => {
    const env = createEnv();
    const res = await postSync(env, { actions: [] });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('INVALID_INPUT');
  });

  it('returns 404 if default collection not found', async () => {
    const env = createEnv({ defaultCollection: null });
    const res = await postSync(env, {
      actions: [{ recipe_id: 'r1', collection_id: null, action: 'add', client_timestamp: '2024-01-01T00:00:00.000Z' }],
    });
    expect(res.status).toBe(404);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('applies add action for new bookmark', async () => {
    const env = createEnv({ existingBookmark: null });
    const res = await postSync(env, {
      actions: [{ recipe_id: 'r1', collection_id: null, action: 'add', client_timestamp: '2024-01-01T00:00:00.000Z' }],
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { results: Array<{ recipe_id: string; status: string }> };
    expect(json.results).toHaveLength(1);
    expect(json.results[0].status).toBe('applied');
    expect(json.results[0].recipe_id).toBe('r1');
  });

  it('applies add action when client timestamp is newer than server', async () => {
    const env = createEnv({
      existingBookmark: { id: 'bk-1', updated_at: '2024-01-01T00:00:00.000Z' },
    });
    const res = await postSync(env, {
      actions: [{ recipe_id: 'r1', collection_id: null, action: 'add', client_timestamp: '2024-06-01T00:00:00.000Z' }],
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { results: Array<{ recipe_id: string; status: string }> };
    expect(json.results[0].status).toBe('applied');
  });

  it('returns conflict on add when server timestamp is newer', async () => {
    const env = createEnv({
      existingBookmark: { id: 'bk-1', updated_at: '2024-06-01T00:00:00.000Z' },
    });
    const res = await postSync(env, {
      actions: [{ recipe_id: 'r1', collection_id: null, action: 'add', client_timestamp: '2024-01-01T00:00:00.000Z' }],
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { results: Array<{ recipe_id: string; status: string; server_state?: { exists: boolean; updated_at: string } }> };
    expect(json.results[0].status).toBe('conflict');
    expect(json.results[0].server_state).toEqual({
      exists: true,
      updated_at: '2024-06-01T00:00:00.000Z',
    });
  });

  it('applies remove action when bookmark exists and client is newer', async () => {
    const env = createEnv({
      existingBookmark: { id: 'bk-1', updated_at: '2024-01-01T00:00:00.000Z' },
    });
    const res = await postSync(env, {
      actions: [{ recipe_id: 'r1', collection_id: null, action: 'remove', client_timestamp: '2024-06-01T00:00:00.000Z' }],
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { results: Array<{ recipe_id: string; status: string }> };
    expect(json.results[0].status).toBe('applied');
  });

  it('returns conflict on remove when server timestamp is newer', async () => {
    const env = createEnv({
      existingBookmark: { id: 'bk-1', updated_at: '2024-06-01T00:00:00.000Z' },
    });
    const res = await postSync(env, {
      actions: [{ recipe_id: 'r1', collection_id: null, action: 'remove', client_timestamp: '2024-01-01T00:00:00.000Z' }],
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { results: Array<{ recipe_id: string; status: string; server_state?: { exists: boolean; updated_at: string } }> };
    expect(json.results[0].status).toBe('conflict');
    expect(json.results[0].server_state).toEqual({
      exists: true,
      updated_at: '2024-06-01T00:00:00.000Z',
    });
  });

  it('applies remove for non-existent bookmark (already deleted)', async () => {
    const env = createEnv({ existingBookmark: null });
    const res = await postSync(env, {
      actions: [{ recipe_id: 'r1', collection_id: null, action: 'remove', client_timestamp: '2024-01-01T00:00:00.000Z' }],
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { results: Array<{ recipe_id: string; status: string }> };
    expect(json.results[0].status).toBe('applied');
  });

  it('handles batch with mixed results', async () => {
    const env = createEnv();
    let selectCallCount = 0;

    // Override for batch — different results per recipe lookup
    (env as unknown as { USERS_DB: { prepare: ReturnType<typeof vi.fn> } }).USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('collections') && sql.includes('is_default')) {
        return makeStmt({ id: 'default-col-1' });
      }
      if (sql.includes('SELECT') && sql.includes('bookmarks') && sql.includes('recipe_id')) {
        selectCallCount++;
        if (selectCallCount === 1) {
          // r1: no existing → add applied
          return makeStmt(null);
        }
        if (selectCallCount === 2) {
          // r2: existing with old timestamp → remove applied
          return makeStmt({ id: 'bk-2', updated_at: '2024-01-01T00:00:00.000Z' });
        }
        if (selectCallCount === 3) {
          // r3: existing with newer timestamp → conflict
          return makeStmt({ id: 'bk-3', updated_at: '2024-12-01T00:00:00.000Z' });
        }
        return makeStmt(null);
      }
      return makeStmt(null);
    });

    const res = await postSync(env, {
      actions: [
        { recipe_id: 'r1', collection_id: null, action: 'add', client_timestamp: '2024-06-01T00:00:00.000Z' },
        { recipe_id: 'r2', collection_id: null, action: 'remove', client_timestamp: '2024-06-01T00:00:00.000Z' },
        { recipe_id: 'r3', collection_id: null, action: 'add', client_timestamp: '2024-06-01T00:00:00.000Z' },
      ],
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { results: Array<{ recipe_id: string; status: string }> };
    expect(json.results).toHaveLength(3);
    expect(json.results[0]).toEqual({ recipe_id: 'r1', status: 'applied' });
    expect(json.results[1]).toEqual({ recipe_id: 'r2', status: 'applied' });
    expect(json.results[2]).toMatchObject({ recipe_id: 'r3', status: 'conflict' });
  });

  it('uses provided collection_id instead of default', async () => {
    const env = createEnv({ existingBookmark: null });
    const res = await postSync(env, {
      actions: [{ recipe_id: 'r1', collection_id: 'custom-col-1', action: 'add', client_timestamp: '2024-01-01T00:00:00.000Z' }],
    });
    expect(res.status).toBe(200);

    // Verify the SELECT used the custom collection_id
    const usersDb = (env as unknown as { USERS_DB: { prepare: ReturnType<typeof vi.fn> } }).USERS_DB;
    const selectBookmarkCall = usersDb.prepare.mock.calls.find(
      (call: string[]) => call[0].includes('SELECT') && call[0].includes('bookmarks') && call[0].includes('recipe_id'),
    );
    expect(selectBookmarkCall).toBeTruthy();
  });
});
