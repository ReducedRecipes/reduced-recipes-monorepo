import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDietaryMask, applyDietaryFilter } from './dietary-filter';

// ── Mock helpers ─────────────────────────────────────────────────────

function makeKV(overrides: Record<string, string> = {}) {
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(overrides[key] ?? null)),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  };
}

function makeD1(results: Record<string, unknown>[] = []) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results, success: true, meta: {} }),
      first: vi.fn().mockResolvedValue(results[0] ?? null),
      run: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
    }),
    batch: vi.fn(),
    exec: vi.fn(),
    dump: vi.fn(),
  };
}

function makeContext(opts: {
  userId?: string;
  header?: Record<string, string>;
  usersDB?: ReturnType<typeof makeD1>;
  userCacheKV?: ReturnType<typeof makeKV>;
} = {}) {
  const variables = new Map<string, unknown>();
  if (opts.userId) variables.set('userId', opts.userId);

  return {
    get: (key: string) => variables.get(key),
    set: (key: string, val: unknown) => variables.set(key, val),
    req: {
      header: (name: string) => opts.header?.[name] ?? undefined,
    },
    env: {
      USERS_DB: opts.usersDB ?? undefined,
      USER_CACHE_KV: opts.userCacheKV ?? undefined,
    },
  } as never;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('getDietaryMask', () => {
  it('returns 0 when no auth and no header', async () => {
    const c = makeContext();
    expect(await getDietaryMask(c)).toBe(0);
  });

  it('parses X-Dietary-Prefs header for anonymous users', async () => {
    const c = makeContext({ header: { 'X-Dietary-Prefs': 'vegetarian,vegan' } });
    const mask = await getDietaryMask(c);
    // vegetarian = 1, vegan = 2
    expect(mask).toBe(3);
  });

  it('ignores invalid restrictions in header', async () => {
    const c = makeContext({ header: { 'X-Dietary-Prefs': 'vegetarian,not-a-real-diet' } });
    const mask = await getDietaryMask(c);
    expect(mask).toBe(1); // only vegetarian
  });

  it('returns 0 for empty header', async () => {
    const c = makeContext({ header: { 'X-Dietary-Prefs': '' } });
    expect(await getDietaryMask(c)).toBe(0);
  });

  it('queries USERS_DB for authenticated user', async () => {
    const usersDB = makeD1([
      { restriction_name: 'gluten-free' },
      { restriction_name: 'dairy-free' },
    ]);
    const userCacheKV = makeKV();
    const c = makeContext({ userId: 'user-1', usersDB, userCacheKV });

    const mask = await getDietaryMask(c);
    // gluten-free = 4, dairy-free = 8
    expect(mask).toBe(12);
    expect(usersDB.prepare).toHaveBeenCalled();
  });

  it('uses KV cache for authenticated user when available', async () => {
    const usersDB = makeD1([]);
    const userCacheKV = makeKV({ 'user-dietary:user-1': '12' });
    const c = makeContext({ userId: 'user-1', usersDB, userCacheKV });

    const mask = await getDietaryMask(c);
    expect(mask).toBe(12);
    // Should NOT have queried DB since cache was hit
    expect(usersDB.prepare).not.toHaveBeenCalled();
  });

  it('caches computed mask in KV', async () => {
    const usersDB = makeD1([{ restriction_name: 'vegan' }]);
    const userCacheKV = makeKV();
    const c = makeContext({ userId: 'user-1', usersDB, userCacheKV });

    await getDietaryMask(c);
    expect(userCacheKV.put).toHaveBeenCalledWith('user-dietary:user-1', '2', { expirationTtl: 3600 });
  });

  it('returns 0 when authenticated user has no preferences', async () => {
    const usersDB = makeD1([]);
    const userCacheKV = makeKV();
    const c = makeContext({ userId: 'user-1', usersDB, userCacheKV });

    const mask = await getDietaryMask(c);
    expect(mask).toBe(0);
  });
});

describe('applyDietaryFilter', () => {
  it('does nothing when mask is 0', () => {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    applyDietaryFilter(conditions, params, 0);
    expect(conditions).toHaveLength(0);
    expect(params).toHaveLength(0);
  });

  it('appends bitmask condition when mask > 0', () => {
    const conditions: string[] = ['r.domain = ?'];
    const params: (string | number)[] = ['example.com'];
    applyDietaryFilter(conditions, params, 5);
    expect(conditions).toHaveLength(2);
    expect(conditions[1]).toContain('dietary_bitmask');
    expect(params).toEqual(['example.com', 5, 5]);
  });
});
