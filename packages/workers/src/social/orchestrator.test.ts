import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @rr/notifier so we can assert sendAlert calls without invoking MailChannels.
interface MockAlertInput { level: 'info' | 'warn' | 'error'; subject: string; body: string }
const sendAlertMock = vi.fn(async (_input: MockAlertInput) => {});
vi.mock('@rr/notifier', () => ({
  createNotifier: vi.fn(() => ({
    sendAlert: sendAlertMock,
    sendDailyDigest: vi.fn(async () => {}),
  })),
}));

// Stable run id so we can assert deterministic SQL bindings.
vi.mock('@rr/social-shared', () => ({
  ulid: () => 'TEST_RUN_01',
}));

import orchestrator from './orchestrator';
import { createNotifier } from '@rr/notifier';

// ── D1 mock helpers (capture-bind-and-run pattern) ──────────────────────

interface CapturedSql {
  sql: string;
  bindings: unknown[];
}

function makeDb() {
  const captured: CapturedSql[] = [];
  const prepare = vi.fn((sql: string) => {
    let pendingBindings: unknown[] = [];
    return {
      bind: vi.fn((...bindings: unknown[]) => {
        pendingBindings = bindings;
        return {
          run: vi.fn(async () => {
            captured.push({ sql, bindings: pendingBindings });
            return { success: true } as unknown as D1Result;
          }),
        };
      }),
      run: vi.fn(async () => {
        captured.push({ sql, bindings: [] });
        return { success: true } as unknown as D1Result;
      }),
    };
  });
  return {
    db: { prepare, batch: vi.fn(async () => []) },
    captured,
  };
}

function makeKv(values: Record<string, string | null>): KVNamespace {
  return {
    get: vi.fn(async (key: string) => values[key] ?? null),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

function createEnv(overrides: {
  killswitch?: string | null;
  signalsRollup?: Fetcher;
  selector?: Fetcher;
} = {}) {
  const { db, captured } = makeDb();
  // Build env with conditional spread so undefined-valued optional props are
  // omitted, satisfying `exactOptionalPropertyTypes`.
  const base = {
    DB: db as unknown as D1Database,
    RR_SOCIAL_KILLSWITCH: makeKv({ global: overrides.killswitch ?? null }),
    NOTIFIER_FROM: 'social-bot@reduced.recipes',
    NOTIFIER_TO: 'ops@reduced.recipes',
    NOTIFIER_FROM_NAME: 'RR Social',
    NOTIFIER_CHANNEL: 'email' as const,
  };
  const env = {
    ...base,
    ...(overrides.signalsRollup ? { SOCIAL_SIGNALS_ROLLUP: overrides.signalsRollup } : {}),
    ...(overrides.selector ? { SOCIAL_SELECTOR: overrides.selector } : {}),
  };
  return { env, captured };
}

function triggerRequest() {
  return new Request('http://localhost/trigger', { method: 'POST' });
}

beforeEach(() => {
  vi.clearAllMocks();
  sendAlertMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-orchestrator', () => {
  describe('killswitch branch', () => {
    it('writes status=killswitch row, fires alert, does not call service bindings', async () => {
      const signalsRollup = { fetch: vi.fn() } as unknown as Fetcher;
      const selector = { fetch: vi.fn() } as unknown as Fetcher;
      const { env, captured } = createEnv({
        killswitch: 'maintenance window',
        signalsRollup,
        selector,
      });

      const response = await orchestrator.fetch(triggerRequest(), env);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('OK');

      // Exactly one INSERT — the killswitch row. No status update follows.
      expect(captured).toHaveLength(1);
      expect(captured[0]!.sql).toContain('INSERT INTO social_orchestrator_runs');
      expect(captured[0]!.bindings).toEqual([
        'TEST_RUN_01',
        expect.any(Number),
        'killswitch',
        'maintenance window',
      ]);

      // Service bindings must not have been invoked.
      expect((signalsRollup as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch)
        .not.toHaveBeenCalled();
      expect((selector as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch)
        .not.toHaveBeenCalled();

      // Notifier alerted.
      expect(createNotifier).toHaveBeenCalledTimes(1);
      expect(sendAlertMock).toHaveBeenCalledTimes(1);
      expect(sendAlertMock.mock.calls[0]![0]).toMatchObject({
        level: 'warn',
        subject: expect.stringContaining('killswitch'),
      });
    });
  });

  describe('happy path with no service bindings', () => {
    it('writes running row then updates to completed; notifier silent', async () => {
      const { env, captured } = createEnv({ killswitch: null });

      const response = await orchestrator.fetch(triggerRequest(), env);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('OK');

      expect(captured).toHaveLength(2);

      // First write: INSERT with status='running'.
      expect(captured[0]!.sql).toContain('INSERT INTO social_orchestrator_runs');
      expect(captured[0]!.bindings[0]).toBe('TEST_RUN_01');
      expect(captured[0]!.bindings[2]).toBe('running');
      expect(captured[0]!.bindings[3]).toBeNull();

      // Second write: UPDATE to status='completed' with zero counts (no selector bound).
      expect(captured[1]!.sql).toContain('UPDATE social_orchestrator_runs');
      expect(captured[1]!.sql).toContain("status = 'completed'");
      expect(captured[1]!.bindings).toEqual([
        expect.any(Number), // finished_at
        0, // candidates_emitted
        0, // drafts_created
        'TEST_RUN_01',
      ]);

      // No alert fired on the happy path.
      expect(sendAlertMock).not.toHaveBeenCalled();
    });
  });

  describe('service-binding routing', () => {
    it('calls SOCIAL_SELECTOR when bound and uses returned counts', async () => {
      const selectorFetch = vi.fn(async () =>
        new Response(JSON.stringify({ candidatesEmitted: 4, draftsCreated: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const selector = { fetch: selectorFetch } as unknown as Fetcher;
      const { env, captured } = createEnv({ killswitch: null, selector });

      const response = await orchestrator.fetch(triggerRequest(), env);
      expect(response.status).toBe(200);

      expect(selectorFetch).toHaveBeenCalledTimes(1);
      const updateRow = captured.find((c) => c.sql.includes('UPDATE social_orchestrator_runs'));
      expect(updateRow).toBeDefined();
      expect(updateRow!.bindings[1]).toBe(4); // candidates_emitted
      expect(updateRow!.bindings[2]).toBe(0); // drafts_created
    });
  });

  describe('failure path', () => {
    it('writes failed row, alerts, returns 500 when selector errors', async () => {
      const selectorFetch = vi.fn(async () =>
        new Response('boom', { status: 500 }),
      );
      const selector = { fetch: selectorFetch } as unknown as Fetcher;
      const { env, captured } = createEnv({ killswitch: null, selector });

      const response = await orchestrator.fetch(triggerRequest(), env);
      expect(response.status).toBe(500);

      const failRow = captured.find(
        (c) => c.sql.includes('UPDATE social_orchestrator_runs') && c.sql.includes("'failed'"),
      );
      expect(failRow).toBeDefined();
      expect(failRow!.bindings[1]).toContain('selector 500');
      expect(sendAlertMock).toHaveBeenCalledTimes(1);
      expect(sendAlertMock.mock.calls[0]![0]!.level).toBe('error');
    });
  });

  describe('routing', () => {
    it('returns 200 OK on GET /health', async () => {
      const { env } = createEnv({ killswitch: null });
      const response = await orchestrator.fetch(
        new Request('http://localhost/health'),
        env,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('OK');
    });

    it('returns 404 for unknown paths', async () => {
      const { env } = createEnv({ killswitch: null });
      const response = await orchestrator.fetch(
        new Request('http://localhost/unknown'),
        env,
      );
      expect(response.status).toBe(404);
    });

    it('returns 404 for GET /trigger (only POST allowed)', async () => {
      const { env } = createEnv({ killswitch: null });
      const response = await orchestrator.fetch(
        new Request('http://localhost/trigger'),
        env,
      );
      expect(response.status).toBe(404);
    });
  });
});
