// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '@rr/shared/env';
import { verifyFirebaseToken, TokenError } from '../firebase-jwt';
import { mintToken, getTestPublicKeySpki, TEST_KID, TEST_PROJECT_ID } from './__fixtures__/firebase-tokens';

function createMockKV(store = new Map<string, string>()) {
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

function envWith(cacheKv: KVNamespace): Env {
  return { CACHE_KV: cacheKv } as unknown as Env;
}

async function stubJwksFetch(spki: string, kid = TEST_KID, init: ResponseInit = {}) {
  // The verifier fetches Google's x509 endpoint. For tests we serve our SPKI
  // wrapped via importSPKI by exposing it as a single key in a JSON object
  // keyed by kid. The verifier uses jose's importX509 by default; we monkey-
  // patch it via the fetch response shape that the verifier's importer accepts.
  // We set up the fetch stub to return our test cert keyed by kid.
  const body: Record<string, string> = { [kid]: spki };
  const headers = new Headers(init.headers);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'max-age=3600');
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

describe('verifyFirebaseToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a valid token and returns the payload', async () => {
    const spki = await getTestPublicKeySpki();
    const { token } = await mintToken({ email: 'a@example.com', emailVerified: true });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(await stubJwksFetch(spki));

    const env = envWith(createMockKV());
    const payload = await verifyFirebaseToken(token, env, TEST_PROJECT_ID);
    expect(payload.sub).toBe('firebase-uid-1');
    expect(payload.email).toBe('a@example.com');
    expect(payload.firebase.sign_in_provider).toBe('google.com');
  });

  it('throws TOKEN_EXPIRED when exp is in the past', async () => {
    const spki = await getTestPublicKeySpki();
    const { token } = await mintToken({ exp: Math.floor(Date.now() / 1000) - 60 });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(await stubJwksFetch(spki));

    const env = envWith(createMockKV());
    await expect(verifyFirebaseToken(token, env, TEST_PROJECT_ID)).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
  });

  it('throws INVALID_TOKEN when audience is wrong', async () => {
    const spki = await getTestPublicKeySpki();
    const { token } = await mintToken({ aud: 'other-project' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(await stubJwksFetch(spki));

    const env = envWith(createMockKV());
    await expect(verifyFirebaseToken(token, env, TEST_PROJECT_ID)).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });

  it('throws INVALID_TOKEN when issuer is wrong', async () => {
    const spki = await getTestPublicKeySpki();
    const { token } = await mintToken({ iss: 'https://example.com/wrong-issuer' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(await stubJwksFetch(spki));

    const env = envWith(createMockKV());
    await expect(verifyFirebaseToken(token, env, TEST_PROJECT_ID)).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });

  it('throws INVALID_TOKEN when kid is unknown to JWKS', async () => {
    const spki = await getTestPublicKeySpki();
    const { token } = await mintToken({ kid: 'unknown-kid' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(await stubJwksFetch(spki, 'different-kid'));

    const env = envWith(createMockKV());
    await expect(verifyFirebaseToken(token, env, TEST_PROJECT_ID)).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });

  it('throws AUTH_UPSTREAM_UNAVAILABLE when JWKS fetch fails', async () => {
    const { token } = await mintToken();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('upstream down', { status: 502 }));

    const env = envWith(createMockKV());
    await expect(verifyFirebaseToken(token, env, TEST_PROJECT_ID)).rejects.toMatchObject({
      code: 'AUTH_UPSTREAM_UNAVAILABLE',
    });
  });

  it('caches JWKS in CACHE_KV between calls', async () => {
    const spki = await getTestPublicKeySpki();
    const { token: token1 } = await mintToken();
    const { token: token2 } = await mintToken({ sub: 'firebase-uid-2' });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(await stubJwksFetch(spki));

    const kv = createMockKV();
    const env = envWith(kv);

    await verifyFirebaseToken(token1, env, TEST_PROJECT_ID);
    await verifyFirebaseToken(token2, env, TEST_PROJECT_ID);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await kv.get('firebase-jwks')).toBeTruthy();
  });
});
