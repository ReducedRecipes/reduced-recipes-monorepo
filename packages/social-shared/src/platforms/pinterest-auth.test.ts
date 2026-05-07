import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getValidPinterestAccessToken, type PinterestAuthEnv } from './pinterest-auth';
import type { PinterestTokenBundle } from '../types';

interface MockKV {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

function makeEnv(stored: PinterestTokenBundle | null): { env: PinterestAuthEnv; kv: MockKV } {
  const kv: MockKV = {
    get: vi.fn().mockResolvedValue(stored),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const env = {
    RR_SOCIAL_TOKENS: kv as unknown as KVNamespace,
    PINTEREST_CLIENT_ID: 'client-id',
    PINTEREST_CLIENT_SECRET: 'client-secret',
  };
  return { env, kv };
}

describe('getValidPinterestAccessToken', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns the stored access token without refreshing when expiry is comfortably in the future', async () => {
    const bundle: PinterestTokenBundle = {
      accessToken: 'live-token',
      refreshToken: 'refresh-token',
      // 1 hour from now -> well outside the 5 minute refresh window
      expiresAt: Date.now() + 60 * 60 * 1000,
      scope: 'pins:read',
      obtainedAt: Date.now(),
    };
    const { env, kv } = makeEnv(bundle);

    const token = await getValidPinterestAccessToken(env);

    expect(token).toBe('live-token');
    expect(kv.get).toHaveBeenCalledWith('pinterest:default', 'json');
    expect(kv.put).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('refreshes when the stored token is inside the 5 minute refresh window and stores the new bundle', async () => {
    const bundle: PinterestTokenBundle = {
      accessToken: 'stale-token',
      refreshToken: 'refresh-token',
      // 1 minute from now -> inside the 5 minute refresh buffer
      expiresAt: Date.now() + 60 * 1000,
      scope: 'pins:read',
      obtainedAt: Date.now(),
    };
    const { env, kv } = makeEnv(bundle);

    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'fresh-token',
          refresh_token: 'fresh-refresh',
          expires_in: 3600,
          scope: 'pins:read',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const token = await getValidPinterestAccessToken(env);

    expect(token).toBe('fresh-token');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.pinterest.com/v5/oauth/token');
    expect((init as RequestInit).method).toBe('POST');

    expect(kv.put).toHaveBeenCalledTimes(1);
    const [putKey, putValue] = kv.put.mock.calls[0];
    expect(putKey).toBe('pinterest:default');
    const written = JSON.parse(putValue as string) as PinterestTokenBundle;
    expect(written.accessToken).toBe('fresh-token');
    expect(written.refreshToken).toBe('fresh-refresh');
    expect(written.scope).toBe('pins:read');
    expect(written.expiresAt).toBeGreaterThan(Date.now());
  });

  it('throws "not bootstrapped" when there is no stored token', async () => {
    const { env, kv } = makeEnv(null);

    await expect(getValidPinterestAccessToken(env)).rejects.toThrow(/not bootstrapped/i);
    expect(kv.put).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
