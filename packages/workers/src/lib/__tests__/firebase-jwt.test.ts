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

    const payload1 = await verifyFirebaseToken(token1, env, TEST_PROJECT_ID);
    const payload2 = await verifyFirebaseToken(token2, env, TEST_PROJECT_ID);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await kv.get('firebase-jwks')).toBeTruthy();
    expect(payload1.sub).toBe('firebase-uid-1');
    expect(payload2.sub).toBe('firebase-uid-2');
  });

  it('accepts tokens within clock-skew tolerance even if just past exp', async () => {
    const spki = await getTestPublicKeySpki();
    // exp 2 seconds in the past; default clockTolerance of 5s lets it through.
    const { token } = await mintToken({ exp: Math.floor(Date.now() / 1000) - 2 });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(await stubJwksFetch(spki));

    const env = envWith(createMockKV());
    const payload = await verifyFirebaseToken(token, env, TEST_PROJECT_ID);
    expect(payload.sub).toBe('firebase-uid-1');
  });

  it('rejects tokens missing the firebase claim', async () => {
    const spki = await getTestPublicKeySpki();
    // Hand-mint a token via jose with no firebase claim so the runtime guard
    // is the only thing that catches it (jose itself accepts arbitrary payloads).
    const { SignJWT, generateKeyPair, exportSPKI } = await import('jose');
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    const altSpki = await exportSPKI(publicKey);

    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ sub: 'no-firebase-claim' })
      .setProtectedHeader({ alg: 'RS256', kid: TEST_KID })
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .setIssuer(`https://securetoken.google.com/${TEST_PROJECT_ID}`)
      .setAudience(TEST_PROJECT_ID)
      .sign(privateKey);

    // Stub JWKS so it returns the alt key (the one that signed this token).
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(await stubJwksFetch(altSpki));
    // Suppress unused warning: spki defined for parity with other tests.
    void spki;

    const env = envWith(createMockKV());
    await expect(verifyFirebaseToken(token, env, TEST_PROJECT_ID)).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });
});
