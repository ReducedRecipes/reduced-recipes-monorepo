import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSession,
  getSession,
  deleteSession,
  updateSessionIndex,
  deleteAllSessions,
} from '../session';

// ── Mock KV ─────────────────────────────────────────────────────────────

function createMockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string, _opts?: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
    _store: store,
  } as unknown as KVNamespace & { _store: Map<string, string> };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('session management', () => {
  let kv: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    kv = createMockKV();
    vi.restoreAllMocks();
  });

  describe('createSession', () => {
    it('returns a token in uuid.timestampHex format', async () => {
      const { token } = await createSession(kv, 'user-1');
      const parts = token.split('.');
      expect(parts).toHaveLength(2);
      // UUID v4 format
      expect(parts[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      // Hex timestamp
      expect(parts[1]).toMatch(/^[0-9a-f]+$/);
    });

    it('stores session in KV with 1-year TTL', async () => {
      const { token } = await createSession(kv, 'user-1');
      expect(kv.put).toHaveBeenCalledWith(
        `session:${token}`,
        expect.any(String),
        { expirationTtl: 365 * 24 * 60 * 60 },
      );

      const stored = JSON.parse(kv._store.get(`session:${token}`)!);
      expect(stored.user_id).toBe('user-1');
      expect(stored.created_at).toBeTypeOf('number');
    });

    it('adds token to reverse index', async () => {
      const { token } = await createSession(kv, 'user-1');
      const index = JSON.parse(kv._store.get('user-sessions:user-1')!);
      expect(index).toContain(token);
    });

    it('appends to existing reverse index', async () => {
      const { token: t1 } = await createSession(kv, 'user-1');
      const { token: t2 } = await createSession(kv, 'user-1');
      const index = JSON.parse(kv._store.get('user-sessions:user-1')!);
      expect(index).toContain(t1);
      expect(index).toContain(t2);
      expect(index).toHaveLength(2);
    });
  });

  describe('getSession', () => {
    it('returns session data for valid token', async () => {
      const { token } = await createSession(kv, 'user-1');
      const session = await getSession(kv, token);
      expect(session).not.toBeNull();
      expect(session).toHaveProperty('user_id', 'user-1');
      expect(session).toHaveProperty('created_at');
    });

    it('returns null for unknown token', async () => {
      const session = await getSession(kv, 'nonexistent.abc');
      expect(session).toBeNull();
    });

    it('returns replacement_token for grace-period entries', async () => {
      kv._store.set(
        'session:old-token',
        JSON.stringify({ replacement_token: 'new-token' }),
      );
      const session = await getSession(kv, 'old-token');
      expect(session).toEqual({ replacement_token: 'new-token' });
    });
  });

  describe('deleteSession', () => {
    it('removes session from KV', async () => {
      const { token } = await createSession(kv, 'user-1');
      await deleteSession(kv, token, 'user-1');
      expect(kv._store.has(`session:${token}`)).toBe(false);
    });

    it('removes token from reverse index', async () => {
      const { token: t1 } = await createSession(kv, 'user-1');
      const { token: t2 } = await createSession(kv, 'user-1');
      await deleteSession(kv, t1, 'user-1');
      const index = JSON.parse(kv._store.get('user-sessions:user-1')!);
      expect(index).not.toContain(t1);
      expect(index).toContain(t2);
    });

    it('deletes reverse index key when last token removed', async () => {
      const { token } = await createSession(kv, 'user-1');
      await deleteSession(kv, token, 'user-1');
      expect(kv._store.has('user-sessions:user-1')).toBe(false);
    });

    it('handles missing reverse index gracefully', async () => {
      kv._store.set('session:tok', JSON.stringify({ user_id: 'u1', created_at: 1 }));
      await expect(deleteSession(kv, 'tok', 'u1')).resolves.toBeUndefined();
    });
  });

  describe('updateSessionIndex', () => {
    it('replaces old token with new token in reverse index', async () => {
      const { token: old } = await createSession(kv, 'user-1');
      await updateSessionIndex(kv, 'user-1', old, 'new-token');
      const index = JSON.parse(kv._store.get('user-sessions:user-1')!);
      expect(index).toContain('new-token');
      expect(index).not.toContain(old);
    });

    it('handles empty reverse index', async () => {
      await updateSessionIndex(kv, 'user-1', 'old', 'new');
      const index = JSON.parse(kv._store.get('user-sessions:user-1')!);
      expect(index).toEqual([]);
    });
  });

  describe('deleteAllSessions', () => {
    it('deletes all session keys and the reverse index', async () => {
      const { token: t1 } = await createSession(kv, 'user-1');
      const { token: t2 } = await createSession(kv, 'user-1');

      await deleteAllSessions(kv, 'user-1');

      expect(kv._store.has(`session:${t1}`)).toBe(false);
      expect(kv._store.has(`session:${t2}`)).toBe(false);
      expect(kv._store.has('user-sessions:user-1')).toBe(false);
    });

    it('handles missing reverse index gracefully', async () => {
      await expect(deleteAllSessions(kv, 'no-user')).resolves.toBeUndefined();
    });
  });
});
