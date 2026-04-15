import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit } from './rate-limit';

function createMockKV(existingKeys: Record<string, string> = {}) {
  return {
    get: vi.fn(async (key: string) => existingKeys[key] ?? null),
    put: vi.fn(async () => {}),
  } as unknown as KVNamespace;
}

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'));
  });

  it('returns true (allowed) when no existing rate limit key', async () => {
    const kv = createMockKV();
    const result = await checkRateLimit('example.com', 3000, kv);
    expect(result).toBe(true);
    expect(kv.put).toHaveBeenCalledOnce();
  });

  it('returns false (rate limited) when key already exists', async () => {
    const delayMs = 3000;
    const window = Math.floor(Date.now() / delayMs);
    const kv = createMockKV({ [`rl:example.com:${window}`]: '1' });

    const result = await checkRateLimit('example.com', delayMs, kv);
    expect(result).toBe(false);
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('sets key with correct TTL', async () => {
    const kv = createMockKV();
    await checkRateLimit('example.com', 5000, kv);

    expect(kv.put).toHaveBeenCalledWith(
      expect.stringContaining('rl:example.com:'),
      '1',
      { expirationTtl: 10 }, // ceil(5000/1000) * 2 = 10
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
