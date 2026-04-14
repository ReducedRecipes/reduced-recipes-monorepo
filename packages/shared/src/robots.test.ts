import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkRobots, parseRobots } from './robots';

describe('parseRobots', () => {
  it('allows URLs not covered by Disallow rules', () => {
    const robots = `User-agent: *
Disallow: /admin/
`;
    expect(parseRobots(robots, 'https://example.com/recipe/1', 'ReducedRecipesBot')).toBe(true);
  });

  it('disallows URLs matching Disallow rule for wildcard agent', () => {
    const robots = `User-agent: *
Disallow: /recipe/
`;
    expect(parseRobots(robots, 'https://example.com/recipe/1', 'ReducedRecipesBot')).toBe(false);
  });

  it('disallows URLs matching specific bot Disallow', () => {
    const robots = `User-agent: ReducedRecipesBot
Disallow: /private/
`;
    expect(parseRobots(robots, 'https://example.com/private/page', 'ReducedRecipesBot')).toBe(false);
  });

  it('allows when no matching user-agent block', () => {
    const robots = `User-agent: Googlebot
Disallow: /
`;
    expect(parseRobots(robots, 'https://example.com/recipe', 'ReducedRecipesBot')).toBe(true);
  });

  it('allows empty Disallow', () => {
    const robots = `User-agent: *
Disallow:
`;
    expect(parseRobots(robots, 'https://example.com/anything', 'ReducedRecipesBot')).toBe(true);
  });
});

describe('checkRobots', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns cached value when available', async () => {
    const env = {
      CACHE_KV: {
        get: vi.fn(async () => 'false'),
        put: vi.fn(async () => {}),
      },
    } as any;

    const result = await checkRobots('https://example.com/recipe', 'example.com', env);
    expect(result).toBe(false);
    expect(env.CACHE_KV.get).toHaveBeenCalledWith('robots:example.com');
  });

  it('fetches and caches robots.txt when not cached', async () => {
    const env = {
      CACHE_KV: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
      },
    } as any;

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => 'User-agent: *\nDisallow: /admin/',
    })));

    const result = await checkRobots('https://example.com/recipe/1', 'example.com', env);
    expect(result).toBe(true);
    expect(env.CACHE_KV.put).toHaveBeenCalledWith('robots:example.com', 'true', { expirationTtl: 86400 });

    vi.unstubAllGlobals();
  });

  it('assumes allowed when robots.txt returns non-ok', async () => {
    const env = {
      CACHE_KV: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
      },
    } as any;

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
    })));

    const result = await checkRobots('https://example.com/recipe', 'example.com', env);
    expect(result).toBe(true);
    expect(env.CACHE_KV.put).toHaveBeenCalledWith('robots:example.com', 'true', { expirationTtl: 86400 });

    vi.unstubAllGlobals();
  });
});
