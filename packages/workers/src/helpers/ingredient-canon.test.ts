import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveCanon, normaliseName } from './ingredient-canon';
import type { Env } from '@rr/shared/env';

// ── Helpers to build mock Env ───────────────────────────────────────

function mockKV(store: Record<string, string> = {}): KVNamespace {
  return {
    get: vi.fn(async (key: string) => store[key] ?? null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    list: vi.fn(async () => ({ keys: [], list_complete: true, cpiCursor: '' })),
    getWithMetadata: vi.fn(async () => ({ value: null, metadata: null, cacheStatus: null })),
  } as unknown as KVNamespace;
}

function mockD1(row: { canonical_name: string; category: string } | null = null): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => row),
        run: vi.fn(async () => ({ success: true })),
      })),
    })),
    batch: vi.fn(async () => []),
    dump: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;
}

function mockAI(response: string | null = null): Ai {
  return {
    run: vi.fn(async () => ({
      response,
    })),
  } as unknown as Ai;
}

function buildEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    RECIPES_KV: {} as KVNamespace,
    CACHE_KV: mockKV(),
    IMAGES_R2: {} as R2Bucket,
    CRAWL_QUEUE: {} as Queue,
    PARSE_QUEUE: {} as Queue,
    PROJECTION_QUEUE: {} as Queue,
    ADMIN_TOKEN: 'test',
    BOT_USER_AGENT: 'test',
    DEFAULT_CRAWL_DELAY_MS: '100',
    MAX_QUEUE_BATCH: '10',
    ENVIRONMENT: 'test',
    USERS_DB: mockD1(),
    AI: mockAI(),
    ...overrides,
  } as Env;
}

// ── normaliseName ───────────────────────────────────────────────────

describe('normaliseName', () => {
  it('lowercases and trims', () => {
    expect(normaliseName('  Baby Spinach  ')).toBe('baby spinach');
  });

  it('collapses whitespace', () => {
    expect(normaliseName('all   purpose   flour')).toBe('all purpose flour');
  });
});

// ── resolveCanon ────────────────────────────────────────────────────

describe('resolveCanon', () => {
  it('returns from KV cache on hit', async () => {
    const cached = JSON.stringify({ canonical_name: 'butter', category: 'Dairy' });
    const kv = mockKV({ 'ingredient:unsalted butter': cached });
    const env = buildEnv({ CACHE_KV: kv });

    const result = await resolveCanon('Unsalted Butter', env);

    expect(result).toEqual({ canonical_name: 'butter', category: 'Dairy' });
    expect(kv.get).toHaveBeenCalledWith('ingredient:unsalted butter');
    // Should not hit D1 or AI
    expect((env.USERS_DB! as any).prepare).not.toHaveBeenCalled();
    expect((env.AI! as any).run).not.toHaveBeenCalled();
  });

  it('falls through corrupted KV cache to D1', async () => {
    const kv = mockKV({ 'ingredient:spinach': 'not-valid-json{{{' });
    const d1 = mockD1({ canonical_name: 'spinach', category: 'Produce' });
    const env = buildEnv({ CACHE_KV: kv, USERS_DB: d1 });

    const result = await resolveCanon('spinach', env);

    expect(result).toEqual({ canonical_name: 'spinach', category: 'Produce' });
    expect(d1.prepare).toHaveBeenCalled();
    expect(kv.put).toHaveBeenCalledWith(
      'ingredient:spinach',
      JSON.stringify({ canonical_name: 'spinach', category: 'Produce' }),
      { expirationTtl: 2592000 },
    );
  });

  it('returns from D1 on KV miss and populates KV cache', async () => {
    const kv = mockKV();
    const d1 = mockD1({ canonical_name: 'flour', category: 'Pantry' });
    const env = buildEnv({ CACHE_KV: kv, USERS_DB: d1 });

    const result = await resolveCanon('all-purpose flour', env);

    expect(result).toEqual({ canonical_name: 'flour', category: 'Pantry' });
    expect(kv.put).toHaveBeenCalledWith(
      'ingredient:all-purpose flour',
      JSON.stringify({ canonical_name: 'flour', category: 'Pantry' }),
      { expirationTtl: 2592000 },
    );
  });

  it('calls AI on D1 miss and stores result in both D1 and KV', async () => {
    const kv = mockKV();
    const d1 = mockD1(null); // no D1 row
    const ai = mockAI('{"canonical_name": "chicken breast", "category": "Meat & Seafood"}');
    const env = buildEnv({ CACHE_KV: kv, USERS_DB: d1, AI: ai });

    const result = await resolveCanon('boneless chicken breast', env);

    expect(result).toEqual({ canonical_name: 'chicken breast', category: 'Meat & Seafood' });
    expect((ai as any).run).toHaveBeenCalled();
    // D1 insert
    expect(d1.prepare).toHaveBeenCalledTimes(2); // 1 SELECT + 1 INSERT
    // KV put
    expect(kv.put).toHaveBeenCalledWith(
      'ingredient:boneless chicken breast',
      JSON.stringify({ canonical_name: 'chicken breast', category: 'Meat & Seafood' }),
      { expirationTtl: 2592000 },
    );
  });

  it('falls back to default when AI returns invalid category', async () => {
    const kv = mockKV();
    const d1 = mockD1(null);
    const ai = mockAI('{"canonical_name": "tofu", "category": "InvalidCategory"}');
    const env = buildEnv({ CACHE_KV: kv, USERS_DB: d1, AI: ai });

    const result = await resolveCanon('firm tofu', env);

    expect(result.canonical_name).toBe('tofu');
    expect(result.category).toBe('Other');
  });

  it('returns fallback when AI fails', async () => {
    const kv = mockKV();
    const d1 = mockD1(null);
    const ai = {
      run: vi.fn(async () => { throw new Error('AI unavailable'); }),
    } as unknown as Ai;
    const env = buildEnv({ CACHE_KV: kv, USERS_DB: d1, AI: ai });

    const result = await resolveCanon('sriracha', env);

    expect(result).toEqual({ canonical_name: 'sriracha', category: 'Other' });
  });

  it('returns fallback when AI returns no response', async () => {
    const kv = mockKV();
    const d1 = mockD1(null);
    const ai = mockAI(null);
    const env = buildEnv({ CACHE_KV: kv, USERS_DB: d1, AI: ai });

    const result = await resolveCanon('mystery ingredient', env);

    expect(result).toEqual({ canonical_name: 'mystery ingredient', category: 'Other' });
  });

  it('handles empty item name gracefully', async () => {
    const env = buildEnv();

    const result = await resolveCanon('', env);

    expect(result).toEqual({ canonical_name: '', category: 'Other' });
    expect((env.CACHE_KV as any).get).not.toHaveBeenCalled();
  });

  it('works without AI binding (AI is undefined)', async () => {
    const kv = mockKV();
    const d1 = mockD1(null);
    const env = buildEnv({ CACHE_KV: kv, USERS_DB: d1 });

    const result = await resolveCanon('quinoa', env);

    expect(result).toEqual({ canonical_name: 'quinoa', category: 'Other' });
  });

  it('works without USERS_DB binding (D1 is undefined)', async () => {
    const kv = mockKV();
    const ai = mockAI('{"canonical_name": "rice", "category": "Pantry"}');
    const env = buildEnv({ CACHE_KV: kv, AI: ai });

    const result = await resolveCanon('jasmine rice', env);

    expect(result).toEqual({ canonical_name: 'rice', category: 'Pantry' });
    // Should still cache in KV
    expect(kv.put).toHaveBeenCalled();
  });
});
