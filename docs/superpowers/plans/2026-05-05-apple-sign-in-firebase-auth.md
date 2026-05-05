# Apple Sign In + Firebase Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sign in with Apple to web and mobile, migrate the existing Google PKCE flow to Firebase Auth, and use Firebase as the identity broker. The existing `users`, `user_auth_providers`, `bookmarks`, `collections` tables remain untouched. The existing `SESSION_KV` session model and `requireAuth` middleware remain untouched.

**Architecture:** Firebase verifies the user's identity via Apple/Google. Workers verify the resulting Firebase ID token using `jose` + Firebase's public JWKS (cached in `CACHE_KV`), then upsert the user and create a `SESSION_KV` session. New `provider='firebase'` rows are added to `user_auth_providers` linking each Firebase UID to the local user. Existing Google users migrate via the shared Google `sub` on first Firebase sign-in.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, D1, KV, Vitest, `jose` (JWT/JWKS), `firebase` JS SDK (web + mobile), `expo-apple-authentication` (mobile native Apple), `@react-native-google-signin/google-signin` (mobile native Google).

**Spec:** `docs/superpowers/specs/2026-05-05-apple-sign-in-firebase-auth-design.md`

---

## Task 1: Add Firebase project ID env binding

**Files:**

- Modify: `packages/shared/src/env.ts:24-32`
- Modify: `packages/workers/wrangler.api.toml`
- Modify: `packages/workers/src/routes/auth.test.ts:50-72` (extend `createEnv` test helper)

- [ ] **Step 1: Add `FIREBASE_PROJECT_ID` to the `Env` interface**

Edit `packages/shared/src/env.ts`. Insert after the existing `GOOGLE_REDIRECT_URI?: string;` line on line 30:

```ts
  /** Firebase Auth — used to verify Firebase ID tokens. */
  FIREBASE_PROJECT_ID?: string;
```

- [ ] **Step 2: Add the var to the API worker config**

Edit `packages/workers/wrangler.api.toml`. Find the `[vars]` block and add:

```toml
FIREBASE_PROJECT_ID = "reducedrecipes"
```

This is not a secret (Firebase project IDs are public per Google's design), so it goes in `[vars]` not as a secret.

- [ ] **Step 3: Run typecheck to ensure no breakage**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/env.ts packages/workers/wrangler.api.toml
git commit -m "feat(shared): add FIREBASE_PROJECT_ID env binding"
```

---

## Task 2: Worker — Firebase JWT verifier (test fixtures)

**Files:**

- Create: `packages/workers/src/lib/__tests__/__fixtures__/firebase-tokens.ts`

- [ ] **Step 1: Add `jose` dependency to workers package**

```bash
cd packages/workers
pnpm add jose
cd ../..
```

Verify `jose` appears under `dependencies` in `packages/workers/package.json`.

- [ ] **Step 2: Create the test fixture helper**

Create `packages/workers/src/lib/__tests__/__fixtures__/firebase-tokens.ts`:

```ts
/**
 * Test helper: mints Firebase-shaped ID tokens signed with a controlled keypair.
 * The verifier under test will be wired to fetch this same keypair's public cert
 * from a stubbed JWKS response (see firebase-jwt.test.ts).
 */
import { SignJWT, generateKeyPair, exportSPKI } from 'jose';

export const TEST_PROJECT_ID = 'test-project';
export const TEST_KID = 'test-kid-1';

export interface MintedToken {
  token: string;
  kid: string;
  cert: string; // PEM-encoded x509-style cert; for tests we use SPKI which jose's importX509 fallback accepts when wrapped
  spki: string;
}

let cachedKeypair: { privateKey: CryptoKey; publicKey: CryptoKey } | null = null;

async function getKeypair() {
  if (cachedKeypair) return cachedKeypair;
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  cachedKeypair = { privateKey, publicKey };
  return cachedKeypair;
}

export interface MintOptions {
  sub?: string; // firebase uid
  aud?: string;
  iss?: string;
  exp?: number; // seconds since epoch
  iat?: number;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  signInProvider?: 'apple.com' | 'google.com';
  identities?: Record<string, string[]>;
  kid?: string;
}

export async function mintToken(opts: MintOptions = {}): Promise<MintedToken> {
  const { privateKey, publicKey } = await getKeypair();
  const kid = opts.kid ?? TEST_KID;
  const provider = opts.signInProvider ?? 'google.com';

  const payload = {
    sub: opts.sub ?? 'firebase-uid-1',
    email: opts.email,
    email_verified: opts.emailVerified,
    name: opts.name,
    firebase: {
      sign_in_provider: provider,
      identities: opts.identities ?? {
        [provider]: ['underlying-sub-1'],
        ...(opts.email ? { email: [opts.email] } : {}),
      },
    },
  };

  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt(opts.iat ?? now)
    .setExpirationTime(opts.exp ?? now + 3600)
    .setIssuer(opts.iss ?? `https://securetoken.google.com/${TEST_PROJECT_ID}`)
    .setAudience(opts.aud ?? TEST_PROJECT_ID)
    .sign(privateKey);

  const spki = await exportSPKI(publicKey);

  // Wrap the SPKI as a fake "x509-style" PEM. The verifier code uses importX509;
  // for testing we expose the raw SPKI and the verifier in tests imports SPKI directly.
  return { token, kid, cert: spki, spki };
}

export async function getTestPublicKeySpki(): Promise<string> {
  const { publicKey } = await getKeypair();
  return exportSPKI(publicKey);
}
```

- [ ] **Step 3: Run vitest to ensure the fixture file compiles**

```bash
pnpm --filter @rr/workers test -- --run src/lib/__tests__/__fixtures__/firebase-tokens.ts 2>&1 | head
```

Expected: no test files matched (file is a helper, not a test). No compilation errors.

Run typecheck explicitly:

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/workers/package.json packages/workers/src/lib/__tests__/__fixtures__/firebase-tokens.ts pnpm-lock.yaml
git commit -m "test(workers): add Firebase test token mint helper"
```

---

## Task 3: Worker — Firebase JWT verifier (firebase-jwt.ts)

**Files:**

- Create: `packages/workers/src/lib/firebase-jwt.ts`
- Create: `packages/workers/src/lib/__tests__/firebase-jwt.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/workers/src/lib/__tests__/firebase-jwt.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @rr/workers test -- --run src/lib/__tests__/firebase-jwt.test.ts
```

Expected: all 7 tests FAIL with module-not-found / TokenError-not-found errors.

- [ ] **Step 3: Implement the verifier**

Create `packages/workers/src/lib/firebase-jwt.ts`:

```ts
/**
 * Firebase ID token verifier — JWKS-based, cached in CACHE_KV.
 *
 * The verifier is provider-aware: Firebase Auth's tokens carry the underlying
 * sign-in provider (google.com / apple.com) and the original sub in
 * payload.firebase.identities. The route handler uses these to upsert into
 * user_auth_providers and link existing pre-Firebase Google users.
 */

import { jwtVerify, decodeProtectedHeader, importX509, importSPKI, errors as joseErrors } from 'jose';
import type { Env } from '@rr/shared/env';

const JWKS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const JWKS_CACHE_KEY = 'firebase-jwks';
const DEFAULT_TTL_SECONDS = 3600;

export type TokenErrorCode = 'TOKEN_EXPIRED' | 'INVALID_TOKEN' | 'AUTH_UPSTREAM_UNAVAILABLE';

export class TokenError extends Error {
  constructor(public code: TokenErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'TokenError';
  }
}

export interface FirebaseTokenPayload {
  sub: string;
  aud: string;
  iss: string;
  iat: number;
  exp: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  firebase: {
    sign_in_provider: string;
    identities: Record<string, string[] | undefined>;
  };
}

interface CachedJwks {
  keys: Record<string, string>;
}

async function fetchJwks(env: Env): Promise<CachedJwks> {
  if (!env.CACHE_KV) {
    throw new TokenError('AUTH_UPSTREAM_UNAVAILABLE', 'CACHE_KV not bound');
  }

  const cached = await env.CACHE_KV.get(JWKS_CACHE_KEY);
  if (cached) return JSON.parse(cached) as CachedJwks;

  const res = await fetch(JWKS_URL);
  if (!res.ok) {
    throw new TokenError('AUTH_UPSTREAM_UNAVAILABLE', `JWKS fetch failed: ${res.status}`);
  }

  const cacheControl = res.headers.get('Cache-Control') ?? '';
  const maxAge = cacheControl.match(/max-age=(\d+)/);
  const ttl = maxAge ? parseInt(maxAge[1], 10) : DEFAULT_TTL_SECONDS;

  const keys = (await res.json()) as Record<string, string>;
  const value: CachedJwks = { keys };
  await env.CACHE_KV.put(JWKS_CACHE_KEY, JSON.stringify(value), { expirationTtl: ttl });
  return value;
}

async function importPublicKey(cert: string): Promise<CryptoKey> {
  // Production: Google returns x509 PEM certs.
  // Tests: pass SPKI PEM (no -----BEGIN CERTIFICATE-----). Try x509 first, fall back.
  if (cert.includes('BEGIN CERTIFICATE')) {
    return importX509(cert, 'RS256');
  }
  return importSPKI(cert, 'RS256');
}

export async function verifyFirebaseToken(
  idToken: string,
  env: Env,
  projectId: string,
): Promise<FirebaseTokenPayload> {
  let header: { kid?: string };
  try {
    header = decodeProtectedHeader(idToken);
  } catch {
    throw new TokenError('INVALID_TOKEN', 'Malformed token header');
  }
  if (!header.kid) {
    throw new TokenError('INVALID_TOKEN', 'Missing kid');
  }

  const { keys } = await fetchJwks(env);
  const cert = keys[header.kid];
  if (!cert) {
    throw new TokenError('INVALID_TOKEN', 'Unknown signing key');
  }

  const publicKey = await importPublicKey(cert);

  try {
    const { payload } = await jwtVerify(idToken, publicKey, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    return payload as unknown as FirebaseTokenPayload;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new TokenError('TOKEN_EXPIRED', err.message);
    }
    if (err instanceof joseErrors.JWTClaimValidationFailed) {
      throw new TokenError('INVALID_TOKEN', err.message);
    }
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
      throw new TokenError('INVALID_TOKEN', err.message);
    }
    throw new TokenError('INVALID_TOKEN', (err as Error).message);
  }
}
```

- [ ] **Step 4: Run tests until they pass**

```bash
pnpm --filter @rr/workers test -- --run src/lib/__tests__/firebase-jwt.test.ts
```

Expected: all 7 tests PASS.

If any fail, iterate on the implementation. Most likely issue: the `importX509` fallback. For tests we use SPKI; production uses x509 — the `importPublicKey` helper handles both.

- [ ] **Step 5: Commit**

```bash
git add packages/workers/src/lib/firebase-jwt.ts packages/workers/src/lib/__tests__/firebase-jwt.test.ts
git commit -m "feat(workers): add Firebase ID token verifier with JWKS caching"
```

---

## Task 4: Worker — POST /auth/firebase-callback route

**Files:**

- Create: `packages/workers/src/routes/firebase-auth.ts`
- Create: `packages/workers/src/routes/firebase-auth.test.ts`
- Modify: `packages/workers/src/api.ts:1012` (add route registration)

- [ ] **Step 1: Write the failing tests**

Create `packages/workers/src/routes/firebase-auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '@rr/shared/env';
import firebaseAuth from './firebase-auth';
import { mintToken, getTestPublicKeySpki, TEST_KID, TEST_PROJECT_ID } from '../lib/__tests__/__fixtures__/firebase-tokens';

interface FakeRow { [k: string]: unknown }

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

function createMockD1(rows: Record<string, FakeRow | null> = {}) {
  // Simple key-by-first-bind mock for deterministic tests.
  // Tests pre-seed `rows` for the queries they exercise.
  const calls: { sql: string; binds: unknown[] }[] = [];
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...binds: unknown[]) => {
        calls.push({ sql, binds });
        return {
          first: vi.fn().mockResolvedValue(rows[`${sql}::${JSON.stringify(binds)}`] ?? null),
          all: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
          run: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
        };
      }),
    })),
    batch: vi.fn().mockResolvedValue([]),
    exec: vi.fn(),
    dump: vi.fn(),
    _calls: calls,
  } as unknown as D1Database & { _calls: typeof calls };
}

async function setupEnv(seedDbRows: Record<string, FakeRow | null> = {}) {
  const spki = await getTestPublicKeySpki();
  const cacheKv = createMockKV();
  // Pre-seed the JWKS cache so we don't need to mock fetch.
  await cacheKv.put('firebase-jwks', JSON.stringify({ keys: { [TEST_KID]: spki } }));

  const env = {
    USERS_DB: createMockD1(seedDbRows),
    SESSION_KV: createMockKV(),
    CACHE_KV: cacheKv,
    FIREBASE_PROJECT_ID: TEST_PROJECT_ID,
  } as unknown as Env;

  return env;
}

async function postCallback(env: Env, idToken: string) {
  return firebaseAuth.request(
    '/api/v1/auth/firebase-callback',
    { method: 'POST', body: JSON.stringify({ idToken }), headers: { 'Content-Type': 'application/json' } },
    env,
  );
}

describe('POST /api/v1/auth/firebase-callback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects when idToken is missing', async () => {
    const env = await setupEnv();
    const res = await firebaseAuth.request(
      '/api/v1/auth/firebase-callback',
      { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it('rejects an invalid token with 401', async () => {
    const env = await setupEnv();
    const res = await postCallback(env, 'not.a.valid.jwt');
    expect(res.status).toBe(401);
  });

  it('creates a new user when no provider/email match exists', async () => {
    const env = await setupEnv();
    const { token } = await mintToken({
      sub: 'fb-new-1',
      email: 'new@example.com',
      emailVerified: true,
      name: 'New User',
      signInProvider: 'apple.com',
      identities: { 'apple.com': ['apple-sub-1'] },
    });

    const res = await postCallback(env, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; is_new_user: boolean };
    expect(body.is_new_user).toBe(true);
    expect(body.token).toBeTruthy();
  });

  it('matches an existing user by Firebase UID (returning user)', async () => {
    const seed = {
      [`SELECT user_id FROM user_auth_providers WHERE provider = 'firebase' AND provider_id = ?::["fb-existing-1"]`]:
        { user_id: 'user-uuid-1' },
      [`SELECT id, email, name, picture_url, profile_public, tier, created_at, updated_at FROM users WHERE id = ?::["user-uuid-1"]`]:
        { id: 'user-uuid-1', email: 'x@example.com', name: 'X', profile_public: 1, tier: 'free', created_at: 't', updated_at: 't' },
    };
    const env = await setupEnv(seed);
    const { token } = await mintToken({ sub: 'fb-existing-1', signInProvider: 'google.com', identities: { 'google.com': ['gsub-1'] } });

    const res = await postCallback(env, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_new_user: boolean };
    expect(body.is_new_user).toBe(false);
  });

  it('migrates an existing pre-Firebase Google user via google sub match', async () => {
    const seed = {
      [`SELECT user_id FROM user_auth_providers WHERE provider = 'firebase' AND provider_id = ?::["fb-fresh-1"]`]: null,
      [`SELECT user_id FROM user_auth_providers WHERE provider = ? AND provider_id = ?::["google","gsub-existing"]`]:
        { user_id: 'user-uuid-2' },
      [`SELECT id, email, name, picture_url, profile_public, tier, created_at, updated_at FROM users WHERE id = ?::["user-uuid-2"]`]:
        { id: 'user-uuid-2', email: 'g@example.com', name: 'G', profile_public: 1, tier: 'free', created_at: 't', updated_at: 't' },
    };
    const env = await setupEnv(seed);
    const { token } = await mintToken({
      sub: 'fb-fresh-1',
      signInProvider: 'google.com',
      identities: { 'google.com': ['gsub-existing'] },
    });

    const res = await postCallback(env, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_new_user: boolean };
    expect(body.is_new_user).toBe(false);
  });

  it('auto-links Apple sign-in to an existing user when verified email matches', async () => {
    const seed = {
      [`SELECT user_id FROM user_auth_providers WHERE provider = 'firebase' AND provider_id = ?::["fb-apple-1"]`]: null,
      [`SELECT user_id FROM user_auth_providers WHERE provider = ? AND provider_id = ?::["apple","apple-sub-x"]`]: null,
      [`SELECT id FROM users WHERE email = ?::["link@example.com"]`]: { id: 'user-uuid-3' },
      [`SELECT id, email, name, picture_url, profile_public, tier, created_at, updated_at FROM users WHERE id = ?::["user-uuid-3"]`]:
        { id: 'user-uuid-3', email: 'link@example.com', name: 'L', profile_public: 1, tier: 'free', created_at: 't', updated_at: 't' },
    };
    const env = await setupEnv(seed);
    const { token } = await mintToken({
      sub: 'fb-apple-1',
      signInProvider: 'apple.com',
      identities: { 'apple.com': ['apple-sub-x'] },
      email: 'link@example.com',
      emailVerified: true,
    });

    const res = await postCallback(env, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_new_user: boolean };
    expect(body.is_new_user).toBe(false);
  });

  it('does NOT auto-link when email is not verified', async () => {
    const seed = {
      [`SELECT user_id FROM user_auth_providers WHERE provider = 'firebase' AND provider_id = ?::["fb-unverified-1"]`]: null,
      [`SELECT user_id FROM user_auth_providers WHERE provider = ? AND provider_id = ?::["apple","apple-sub-y"]`]: null,
      // Note: no email lookup is seeded — the route should not attempt it for unverified emails.
    };
    const env = await setupEnv(seed);
    const { token } = await mintToken({
      sub: 'fb-unverified-1',
      signInProvider: 'apple.com',
      identities: { 'apple.com': ['apple-sub-y'] },
      email: 'unverified@example.com',
      emailVerified: false,
      name: 'U',
    });

    const res = await postCallback(env, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_new_user: boolean };
    expect(body.is_new_user).toBe(true);
  });

  it('treats Hide-My-Email relay as a new account when no exact email match', async () => {
    const seed = {
      [`SELECT user_id FROM user_auth_providers WHERE provider = 'firebase' AND provider_id = ?::["fb-relay-1"]`]: null,
      [`SELECT user_id FROM user_auth_providers WHERE provider = ? AND provider_id = ?::["apple","apple-sub-relay"]`]: null,
      [`SELECT id FROM users WHERE email = ?::["xyz123@privaterelay.appleid.com"]`]: null,
    };
    const env = await setupEnv(seed);
    const { token } = await mintToken({
      sub: 'fb-relay-1',
      signInProvider: 'apple.com',
      identities: { 'apple.com': ['apple-sub-relay'] },
      email: 'xyz123@privaterelay.appleid.com',
      emailVerified: true,
      name: 'R',
    });

    const res = await postCallback(env, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_new_user: boolean };
    expect(body.is_new_user).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @rr/workers test -- --run src/routes/firebase-auth.test.ts
```

Expected: all tests FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `packages/workers/src/routes/firebase-auth.ts`:

```ts
/**
 * POST /api/v1/auth/firebase-callback
 *
 * Accepts a Firebase ID token, verifies it against Firebase JWKS, and
 * upserts/matches the user. Creates a SESSION_KV session and returns the
 * token + user. Web also gets a __Host-session cookie set.
 *
 * Lookup order:
 * 1. provider='firebase' AND provider_id=firebase_uid (returning user)
 * 2. provider=<google|apple> AND provider_id=<google_sub|apple_sub> (migration)
 * 3. users.email match — only if email_verified=true (auto-link)
 * 4. Create new user
 */

import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import type { Env } from '@rr/shared/env';
import type { User } from '@rr/shared';
import { verifyFirebaseToken, TokenError, type FirebaseTokenPayload } from '../lib/firebase-jwt';
import { createSession } from '../lib/session';

const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

const firebase = new Hono<{ Bindings: Env }>();

firebase.post('/api/v1/auth/firebase-callback', async (c) => {
  const projectId = c.env.FIREBASE_PROJECT_ID;
  const usersDB = c.env.USERS_DB;
  const sessionKV = c.env.SESSION_KV;

  if (!projectId || !usersDB || !sessionKV) {
    return c.json({ error: { code: 'SERVER_ERROR', message: 'Auth not configured' } }, 500);
  }

  let body: { idToken?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'Invalid JSON' } }, 400);
  }
  if (!body.idToken) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'idToken required' } }, 400);
  }

  let payload: FirebaseTokenPayload;
  try {
    payload = await verifyFirebaseToken(body.idToken, c.env, projectId);
  } catch (err) {
    if (err instanceof TokenError) {
      const status = err.code === 'AUTH_UPSTREAM_UNAVAILABLE' ? 503 : 401;
      return c.json({ error: { code: err.code, message: err.message } }, status);
    }
    throw err;
  }

  const firebaseUid = payload.sub;
  const signInProvider = payload.firebase.sign_in_provider;
  const providerName: 'google' | 'apple' | null =
    signInProvider === 'google.com' ? 'google' : signInProvider === 'apple.com' ? 'apple' : null;
  if (!providerName) {
    return c.json({ error: { code: 'INVALID_TOKEN', message: 'Unsupported provider' } }, 400);
  }

  const providerSub = payload.firebase.identities[signInProvider]?.[0];
  if (!providerSub) {
    return c.json({ error: { code: 'INVALID_TOKEN', message: 'Missing provider identity' } }, 400);
  }

  const email = payload.email ?? null;
  const emailVerified = payload.email_verified === true;
  const displayName = payload.name ?? email ?? 'User';

  // 1. Returning user: match by Firebase UID
  let userId: string | null = null;
  let isNewUser = false;
  let row = await usersDB
    .prepare(`SELECT user_id FROM user_auth_providers WHERE provider = 'firebase' AND provider_id = ?`)
    .bind(firebaseUid)
    .first<{ user_id: string }>();
  if (row) userId = row.user_id;

  // 2. Migration: match by underlying provider sub
  if (!userId) {
    row = await usersDB
      .prepare(`SELECT user_id FROM user_auth_providers WHERE provider = ? AND provider_id = ?`)
      .bind(providerName, providerSub)
      .first<{ user_id: string }>();
    if (row) userId = row.user_id;
  }

  // 3. Auto-link: match verified email to an existing user
  if (!userId && email && emailVerified) {
    const userRow = await usersDB
      .prepare(`SELECT id FROM users WHERE email = ?`)
      .bind(email)
      .first<{ id: string }>();
    if (userRow) userId = userRow.id;
  }

  // 4. Create new user
  if (!userId) {
    if (!email) {
      return c.json(
        { error: { code: 'INVALID_TOKEN', message: 'Email required to create account' } },
        400,
      );
    }
    userId = crypto.randomUUID();
    isNewUser = true;
    const now = new Date().toISOString();
    await usersDB
      .prepare(
        `INSERT INTO users (id, email, name, picture_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(userId, email, displayName, payload.picture ?? null, now, now)
      .run();

    await usersDB
      .prepare(
        `INSERT INTO collections (id, user_id, name, is_default, position) VALUES (?, ?, 'Saved', 1, 0)`,
      )
      .bind(crypto.randomUUID(), userId)
      .run();

    await usersDB
      .prepare(
        `INSERT INTO consent_records (user_id, consent_type, granted, ip_address, user_agent) VALUES (?, 'terms_of_service', 1, ?, ?)`,
      )
      .bind(
        userId,
        c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? '',
        c.req.header('User-Agent') ?? '',
      )
      .run();
  }

  // 5. Upsert provider rows (underlying provider + Firebase link).
  // COALESCE preserves stored values when Apple/Google omit them on subsequent sign-ins
  // (Apple in particular only sends name/email on the very first sign-in).
  await usersDB
    .prepare(
      `INSERT INTO user_auth_providers (user_id, provider, provider_id, provider_email, provider_name, provider_avatar)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         provider_email = COALESCE(excluded.provider_email, provider_email),
         provider_name = COALESCE(excluded.provider_name, provider_name),
         provider_avatar = COALESCE(excluded.provider_avatar, provider_avatar)`,
    )
    .bind(userId, providerName, providerSub, email, displayName, payload.picture ?? null)
    .run();

  await usersDB
    .prepare(
      `INSERT INTO user_auth_providers (user_id, provider, provider_id, provider_email, provider_name, provider_avatar)
       VALUES (?, 'firebase', ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         provider_email = COALESCE(excluded.provider_email, provider_email),
         provider_name = COALESCE(excluded.provider_name, provider_name),
         provider_avatar = COALESCE(excluded.provider_avatar, provider_avatar)`,
    )
    .bind(userId, firebaseUid, email, displayName, payload.picture ?? null)
    .run();

  // 6. Refresh users.updated_at for returning users (skipped on isNewUser since INSERT already set it).
  if (!isNewUser) {
    await usersDB
      .prepare(`UPDATE users SET updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), userId)
      .run();
  }

  // 7. Fetch the canonical user row
  const user = await usersDB
    .prepare(
      `SELECT id, email, name, picture_url, profile_public, tier, created_at, updated_at FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<User>();
  if (!user) {
    return c.json(
      { error: { code: 'USER_INTEGRITY_ERROR', message: 'User missing after upsert' } },
      500,
    );
  }

  // 8. Create session
  const { token } = await createSession(sessionKV, userId);

  // 9. Set cookie for web (mobile reads token from JSON)
  setCookie(c, 'session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  return c.json({ token, user, is_new_user: isNewUser });
});

export default firebase;
```

- [ ] **Step 4: Run tests until they pass**

```bash
pnpm --filter @rr/workers test -- --run src/routes/firebase-auth.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Register the route in api.ts**

Open `packages/workers/src/api.ts`. Find the line `app.route('/', authRoutes);` (line ~1012). Add the import at the top and register the new route immediately after the existing auth routes.

Add to imports (near other route imports):

```ts
import firebaseAuthRoutes from './routes/firebase-auth';
```

Add registration immediately after `app.route('/', authRoutes);`:

```ts
app.route('/', firebaseAuthRoutes);
```

- [ ] **Step 6: Run all worker tests**

```bash
pnpm --filter @rr/workers test
```

Expected: all tests pass, including the existing auth tests.

- [ ] **Step 7: Commit**

```bash
git add packages/workers/src/routes/firebase-auth.ts packages/workers/src/routes/firebase-auth.test.ts packages/workers/src/api.ts
git commit -m "feat(workers): add POST /auth/firebase-callback route"
```

---

## Task 5: Frontend — Firebase initialization + sign-in handlers

**Files:**

- Create: `packages/frontend/src/lib/firebase.ts`
- Create: `packages/frontend/src/lib/auth-firebase.ts`
- Create: `packages/frontend/src/lib/__tests__/auth-firebase.test.ts`
- Modify: `packages/frontend/package.json` (add `firebase`)

- [ ] **Step 1: Add firebase dependency**

```bash
cd packages/frontend
pnpm add firebase
cd ../..
```

Verify `firebase` appears under `dependencies` in `packages/frontend/package.json`.

- [ ] **Step 2: Create the Firebase init module**

Create `packages/frontend/src/lib/firebase.ts`:

```ts
/**
 * Firebase initialization for the web client.
 *
 * Config values are public per Firebase's design (restricted by authorized
 * domains in the Firebase console). They are committed in source rather than
 * read from env vars.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDqJceLhCOUs-ViAtmdGy_5hmaLp9Fj7MY',
  authDomain: 'reducedrecipes.firebaseapp.com',
  projectId: 'reducedrecipes',
  appId: '1:185737034001:web:bd59e775cb6809a4cd74b0',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');
```

- [ ] **Step 3: Write the failing tests for sign-in handlers**

Create `packages/frontend/src/lib/__tests__/auth-firebase.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signInWithFirebaseProvider } from '../auth-firebase';

vi.mock('../firebase', () => ({
  auth: { mock: 'auth' },
  googleProvider: { mock: 'google' },
  appleProvider: { mock: 'apple' },
}));

const mockSignInWithPopup = vi.fn();
const mockSignInWithRedirect = vi.fn();
const mockGetIdToken = vi.fn();

vi.mock('firebase/auth', () => ({
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  signInWithRedirect: (...args: unknown[]) => mockSignInWithRedirect(...args),
}));

describe('signInWithFirebaseProvider', () => {
  beforeEach(() => {
    mockSignInWithPopup.mockReset();
    mockSignInWithRedirect.mockReset();
    mockGetIdToken.mockReset();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'session-tok',
          user: { id: 'u1', email: 'a@b.com' },
          is_new_user: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  });

  it('calls signInWithPopup, exchanges the ID token, and returns the session', async () => {
    mockSignInWithPopup.mockResolvedValueOnce({
      user: { getIdToken: mockGetIdToken.mockResolvedValueOnce('firebase-id-token') },
    });

    const result = await signInWithFirebaseProvider('google');
    expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
    expect(result.token).toBe('session-tok');
    expect(result.is_new_user).toBe(true);
  });

  it('falls back to signInWithRedirect when the popup is blocked', async () => {
    mockSignInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-blocked' });

    await signInWithFirebaseProvider('apple');
    expect(mockSignInWithRedirect).toHaveBeenCalledTimes(1);
  });

  it('throws when the user cancels the popup', async () => {
    mockSignInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });

    await expect(signInWithFirebaseProvider('google')).rejects.toThrow();
  });

  it('throws when the backend returns an error', async () => {
    mockSignInWithPopup.mockResolvedValueOnce({
      user: { getIdToken: mockGetIdToken.mockResolvedValueOnce('firebase-id-token') },
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'INVALID_TOKEN', message: 'bad' } }), {
        status: 401,
      }),
    );

    await expect(signInWithFirebaseProvider('google')).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
pnpm --filter @rr/frontend test -- --run src/lib/__tests__/auth-firebase.test.ts
```

Expected: all 4 tests FAIL — module not found.

- [ ] **Step 5: Implement the sign-in handler**

Create `packages/frontend/src/lib/auth-firebase.ts`:

```ts
/**
 * Firebase sign-in handlers for the web client.
 *
 * Wraps Firebase's signInWithPopup (with redirect fallback for Safari) and
 * exchanges the resulting Firebase ID token for a SESSION_KV-backed session
 * via POST /api/v1/auth/firebase-callback.
 */

import { signInWithPopup, signInWithRedirect } from 'firebase/auth';
import type { User } from '@rr/shared';
import { auth, googleProvider, appleProvider } from './firebase';

export type FirebaseProvider = 'google' | 'apple';

export interface FirebaseSessionResponse {
  token: string;
  user: User;
  is_new_user: boolean;
}

const API_BASE = `${import.meta.env.VITE_API_BASE || ''}/api/v1`;

export async function signInWithFirebaseProvider(
  providerName: FirebaseProvider,
): Promise<FirebaseSessionResponse> {
  const provider = providerName === 'google' ? googleProvider : appleProvider;

  let firebaseIdToken: string;
  try {
    const result = await signInWithPopup(auth, provider);
    firebaseIdToken = await result.user.getIdToken();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/popup-blocked') {
      // Fallback: redirect-based sign-in. The redirect side handles itself
      // via getRedirectResult on next page load (caller can hook into that).
      await signInWithRedirect(auth, provider);
      throw new Error('Redirect sign-in initiated; complete in browser');
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Sign-in cancelled');
    }
    throw err;
  }

  const res = await fetch(`${API_BASE}/auth/firebase-callback`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: firebaseIdToken }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Sign-in failed: ${res.status}`);
  }

  return (await res.json()) as FirebaseSessionResponse;
}
```

- [ ] **Step 6: Run tests until they pass**

```bash
pnpm --filter @rr/frontend test -- --run src/lib/__tests__/auth-firebase.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/package.json packages/frontend/src/lib/firebase.ts packages/frontend/src/lib/auth-firebase.ts packages/frontend/src/lib/__tests__/auth-firebase.test.ts pnpm-lock.yaml
git commit -m "feat(frontend): add Firebase init and sign-in handlers"
```

---

## Task 6: Frontend — Sign-in UI with both providers

**Files:**

- Modify: `packages/frontend/src/components/LoginButton.tsx`
- Modify: `packages/frontend/src/hooks/useAuth.ts:41-50` (replace login() body to use Firebase)
- Modify: `packages/frontend/src/stores/auth.store.ts` (no API change; verify token persistence still works)

- [ ] **Step 1: Update useAuth.login to dispatch a UI event instead of redirecting**

The current `login()` does the OAuth redirect inline. With Firebase we open a popup, so the button itself triggers the popup. We replace `login()` with a no-op or a UI event dispatch so the existing component contract stays.

Edit `packages/frontend/src/hooks/useAuth.ts`. Replace the `login` function (lines 41-50) with:

```ts
  const login = async () => {
    if (isInAppBrowser()) {
      window.dispatchEvent(new CustomEvent("inapp-browser-login"));
      return;
    }
    // Firebase popup flow is now handled by the LoginButton component itself,
    // which calls signInWithFirebaseProvider directly. This hook just signals
    // to the component to open its provider menu.
    window.dispatchEvent(new CustomEvent("open-signin-menu"));
  };
```

Note the function is now sync — adjust the type if necessary; it returns `Promise<void>` to keep the existing API.

Update the function signature to remain `async`:

```ts
  const login = async () => {
```

(Already async — keep as-is.)

- [ ] **Step 2: Replace the LoginButton click handler with a popover that shows both providers**

Edit `packages/frontend/src/components/LoginButton.tsx`. Replace the unauthenticated button block (lines 77-84) with a button + dropdown showing both Apple and Google buttons.

Replace lines 77-84:

```tsx
    return (
      <button
        onClick={() => login()}
        className={`rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 ${className}`}
      >
        Sign in
      </button>
    );
```

With:

```tsx
    return (
      <SignInMenu className={className} onSignedIn={(token) => {
        localStorage.setItem('session_token', token);
        // Force the useAuth /auth/me query to re-run and pick up the new session.
        window.location.reload();
      }} />
    );
```

Add `SignInMenu` as a small inline component above the `LoginButton` export:

```tsx
function SignInMenu({ className, onSignedIn }: { className?: string; onSignedIn: (token: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "google" | "apple">(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleProvider = async (p: "google" | "apple") => {
    setError(null);
    setBusy(p);
    try {
      const { signInWithFirebaseProvider } = await import("../lib/auth-firebase");
      const { token } = await signInWithFirebaseProvider(p);
      onSignedIn(token);
    } catch (err) {
      const msg = (err as Error).message ?? "Sign-in failed";
      if (!msg.includes("cancelled")) setError(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
      >
        Sign in
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-lg z-10">
          <button
            disabled={busy !== null}
            onClick={() => handleProvider("apple")}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
          >
            <span aria-hidden></span>
            <span>Sign in with Apple</span>
          </button>
          <button
            disabled={busy !== null}
            onClick={() => handleProvider("google")}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <span aria-hidden>G</span>
            <span>Sign in with Google</span>
          </button>
          {error && (
            <p className="mt-2 px-1 text-xs text-red-600">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

Apple branding: the button uses black background + white text, which matches Apple's HIG minimum. The Apple logo glyph would normally be inserted via an SVG; for v1 the text-only approach is acceptable. If it fails App Store branding review later, swap in the official SVG.

The Apple and Google buttons are equally prominent (same width and height) per Apple HIG.

- [ ] **Step 3: Run typecheck and tests**

```bash
pnpm typecheck
pnpm --filter @rr/frontend test
```

Expected: passes. The existing `useAuth` tests may need an update if they assert on the old `login()` redirect behaviour — fix any failures inline.

- [ ] **Step 4: Manual smoke test**

```bash
pnpm dev
```

Open the dev server, click "Sign in" — both Apple and Google buttons should appear in a dropdown. Don't actually complete the sign-in yet (Firebase isn't fully wired in dev until env values match a real Firebase project authorized for `localhost`).

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/LoginButton.tsx packages/frontend/src/hooks/useAuth.ts
git commit -m "feat(frontend): add sign-in menu with Apple + Google providers"
```

---

## Task 7: Mobile — dependencies + Firebase init

**Files:**

- Modify: `packages/mobile/package.json`
- Modify: `packages/mobile/app.json` (add expo plugins)
- Create: `packages/mobile/src/lib/firebase.ts`

- [ ] **Step 1: Add dependencies**

```bash
cd packages/mobile
pnpm add firebase expo-apple-authentication @react-native-google-signin/google-signin
cd ../..
```

Verify all three appear under `dependencies` in `packages/mobile/package.json`.

- [ ] **Step 2: Add expo-apple-authentication plugin to app.json**

Edit `packages/mobile/app.json`. In the `plugins` array (line 64-91), add:

```json
      "expo-apple-authentication",
```

Insert it after the existing `"expo-router"` entry. The plugins array becomes:

```json
    "plugins": [
      "expo-router",
      "expo-apple-authentication",
      [
        "expo-font",
        ...
```

- [ ] **Step 3: Create the Firebase init module**

Create `packages/mobile/src/lib/firebase.ts`:

```ts
/**
 * Firebase initialization for React Native (Expo).
 *
 * Uses the modular firebase JS SDK. Apple/Google credentials are obtained via
 * native libraries (expo-apple-authentication, @react-native-google-signin)
 * and exchanged for Firebase ID tokens via signInWithCredential.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, OAuthProvider, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDqJceLhCOUs-ViAtmdGy_5hmaLp9Fj7MY',
  authDomain: 'reducedrecipes.firebaseapp.com',
  projectId: 'reducedrecipes',
  appId: '1:185737034001:web:bd59e775cb6809a4cd74b0',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export { OAuthProvider, GoogleAuthProvider };
```

- [ ] **Step 4: Configure Google Sign-In with the iOS web client ID**

The `@react-native-google-signin/google-signin` library needs the iOS web client ID at app start. Look at `packages/mobile/GoogleService-Info.plist` — the `CLIENT_ID` value (in plist) is the iOS client ID; we need the corresponding **web** client ID, which is the OAuth client linked to the Firebase project's web app.

The web client ID is the same value as the Firebase web `apiKey`'s associated OAuth client. Find it via:

```
Firebase console → Project settings → General → Your apps → Web app → Web SDK configuration
```

Or via Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs → "Web client (auto created by Google Service)".

Add it to a new constant in `packages/mobile/src/lib/firebase.ts`:

```ts
// Used by @react-native-google-signin/google-signin to mint the Google ID token
// that we then exchange with Firebase. This is the OAuth WEB client ID for our
// Firebase project (not the iOS or Android client ID).
export const GOOGLE_WEB_CLIENT_ID = '<paste-here-from-firebase-console>';
```

> **Action required:** the user needs to provide this value. Pause and ask if not already known.

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add packages/mobile/package.json packages/mobile/app.json packages/mobile/src/lib/firebase.ts pnpm-lock.yaml
git commit -m "feat(mobile): add Firebase + Apple/Google sign-in dependencies"
```

---

## Task 8: Mobile — sign-in handlers (auth-firebase.ts)

**Files:**

- Create: `packages/mobile/src/lib/auth-firebase.ts`
- Create: `packages/mobile/src/lib/__tests__/auth-firebase.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/mobile/src/lib/__tests__/auth-firebase.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({
  auth: { mock: 'auth' },
  OAuthProvider: class { credential = vi.fn(() => ({ mock: 'apple-cred' })); },
  GoogleAuthProvider: { credential: vi.fn(() => ({ mock: 'google-cred' })) },
  GOOGLE_WEB_CLIENT_ID: 'test-web-client-id',
}));

const mockSignInWithCredential = vi.fn();
vi.mock('firebase/auth', () => ({
  signInWithCredential: (...args: unknown[]) => mockSignInWithCredential(...args),
}));

const mockAppleSignIn = vi.fn();
vi.mock('expo-apple-authentication', () => ({
  signInAsync: (...args: unknown[]) => mockAppleSignIn(...args),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: vi.fn().mockResolvedValue(true),
}));

const mockGoogleConfigure = vi.fn();
const mockGoogleSignIn = vi.fn();
vi.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...args: unknown[]) => mockGoogleConfigure(...args),
    signIn: (...args: unknown[]) => mockGoogleSignIn(...args),
    hasPlayServices: vi.fn().mockResolvedValue(true),
  },
  statusCodes: { SIGN_IN_CANCELLED: 'CANCELLED' },
}));

const mockExpoCryptoDigest = vi.fn();
vi.mock('expo-crypto', () => ({
  digestStringAsync: (...args: unknown[]) => mockExpoCryptoDigest(...args),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  randomUUID: vi.fn(() => 'random-nonce'),
}));

import { signInWithApple, signInWithGoogle } from '../auth-firebase';

describe('mobile signInWithApple', () => {
  beforeEach(() => {
    mockSignInWithCredential.mockReset();
    mockAppleSignIn.mockReset();
    mockExpoCryptoDigest.mockReset().mockResolvedValue('hashed-nonce');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'sess',
          user: { id: 'u', email: 'a@b.com' },
          is_new_user: false,
        }),
        { status: 200 },
      ),
    );
  });

  it('signs in via Apple, exchanges with Firebase, and posts to backend', async () => {
    mockAppleSignIn.mockResolvedValueOnce({ identityToken: 'apple-id-token', authorizationCode: 'auth-code' });
    mockSignInWithCredential.mockResolvedValueOnce({
      user: { getIdToken: vi.fn().mockResolvedValue('firebase-id-token') },
    });

    const result = await signInWithApple();
    expect(mockAppleSignIn).toHaveBeenCalledTimes(1);
    expect(mockExpoCryptoDigest).toHaveBeenCalled();
    expect(mockSignInWithCredential).toHaveBeenCalled();
    expect(result.token).toBe('sess');
  });

  it('throws when Apple returns no identityToken', async () => {
    mockAppleSignIn.mockResolvedValueOnce({ identityToken: null });
    await expect(signInWithApple()).rejects.toThrow();
  });
});

describe('mobile signInWithGoogle', () => {
  beforeEach(() => {
    mockSignInWithCredential.mockReset();
    mockGoogleSignIn.mockReset();
    mockGoogleConfigure.mockReset();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'sess',
          user: { id: 'u', email: 'a@b.com' },
          is_new_user: false,
        }),
        { status: 200 },
      ),
    );
  });

  it('signs in via Google, exchanges with Firebase, and posts to backend', async () => {
    mockGoogleSignIn.mockResolvedValueOnce({ data: { idToken: 'google-id-token' } });
    mockSignInWithCredential.mockResolvedValueOnce({
      user: { getIdToken: vi.fn().mockResolvedValue('firebase-id-token') },
    });

    const result = await signInWithGoogle();
    expect(mockGoogleSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignInWithCredential).toHaveBeenCalled();
    expect(result.token).toBe('sess');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @rr/mobile test -- --run src/lib/__tests__/auth-firebase.test.ts
```

Expected: tests FAIL — module not found.

- [ ] **Step 3: Implement the handlers**

Create `packages/mobile/src/lib/auth-firebase.ts`:

```ts
/**
 * Mobile Firebase sign-in handlers.
 *
 * Apple: native sheet via expo-apple-authentication → Firebase OAuthCredential
 * → signInWithCredential → backend exchange.
 *
 * Google: native picker via @react-native-google-signin → Google ID token →
 * Firebase GoogleAuthProvider.credential → signInWithCredential → backend.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { signInWithCredential } from 'firebase/auth';
import type { User } from '@rr/shared';
import { auth, OAuthProvider, GoogleAuthProvider, GOOGLE_WEB_CLIENT_ID } from './firebase';

const API_BASE = `${process.env.EXPO_PUBLIC_API_BASE ?? 'https://reducedrecipes.com'}/api/v1`;

export interface FirebaseSessionResponse {
  token: string;
  user: User;
  is_new_user: boolean;
}

let googleConfigured = false;
function ensureGoogleConfigured() {
  if (googleConfigured) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  googleConfigured = true;
}

async function exchangeFirebaseToken(idToken: string): Promise<FirebaseSessionResponse> {
  const res = await fetch(`${API_BASE}/auth/firebase-callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Sign-in failed: ${res.status}`);
  }
  return (await res.json()) as FirebaseSessionResponse;
}

export async function signInWithApple(): Promise<FirebaseSessionResponse> {
  // Apple's nonce dance: hash a random nonce, send to Apple, get back a token
  // bound to that hash. Pass the unhashed nonce to Firebase to verify binding.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token');
  }

  const provider = new OAuthProvider('apple.com');
  const fbCredential = provider.credential({
    idToken: credential.identityToken,
    rawNonce,
  });
  const result = await signInWithCredential(auth, fbCredential);
  const firebaseIdToken = await result.user.getIdToken();
  return exchangeFirebaseToken(firebaseIdToken);
}

export async function signInWithGoogle(): Promise<FirebaseSessionResponse> {
  ensureGoogleConfigured();
  await GoogleSignin.hasPlayServices();
  const signInResult = await GoogleSignin.signIn();
  const googleIdToken = signInResult.data?.idToken;
  if (!googleIdToken) {
    throw new Error('Google did not return an ID token');
  }
  const fbCredential = GoogleAuthProvider.credential(googleIdToken);
  const result = await signInWithCredential(auth, fbCredential);
  const firebaseIdToken = await result.user.getIdToken();
  return exchangeFirebaseToken(firebaseIdToken);
}
```

- [ ] **Step 4: Run tests until they pass**

```bash
pnpm --filter @rr/mobile test -- --run src/lib/__tests__/auth-firebase.test.ts
```

Expected: all tests PASS. If `OAuthProvider.credential` test mock fails because the production code calls `.credential({ idToken, rawNonce })`, update the test mock to:

```ts
OAuthProvider: class { credential(args: { idToken: string; rawNonce: string }) { return { mock: 'apple-cred', ...args }; } },
```

- [ ] **Step 5: Commit**

```bash
git add packages/mobile/src/lib/auth-firebase.ts packages/mobile/src/lib/__tests__/auth-firebase.test.ts
git commit -m "feat(mobile): add Firebase sign-in handlers for Apple and Google"
```

---

## Task 9: Mobile — replace settings.tsx sign-in UI

**Files:**

- Modify: `packages/mobile/app/(tabs)/settings.tsx:112-140` (replace `handleSignIn` and the button rendering)

- [ ] **Step 1: Locate the existing sign-in section**

Open `packages/mobile/app/(tabs)/settings.tsx`. Find the sign-in section (around lines 112-140 contains `handleSignIn`; the button rendering is elsewhere — likely under a `!sessionToken` conditional render in the JSX).

Search for the JSX that renders the existing sign-in button (uses `handleSignIn` and likely shows a single "Sign in with Google" button).

```bash
grep -n "handleSignIn\|Sign in" packages/mobile/app/\(tabs\)/settings.tsx
```

- [ ] **Step 2: Replace handleSignIn with two handlers**

Replace the existing `handleSignIn` function (lines 112-140) with two new handlers, one per provider:

```tsx
  const handleApple = async () => {
    setIsLoading(true);
    try {
      const { signInWithApple } = await import('@/lib/auth-firebase');
      const { token, user } = await signInWithApple();
      await storeToken(token);
      setSession(token, user);
    } catch (err) {
      const msg = (err as Error).message ?? 'Apple sign-in failed';
      if (!msg.includes('cancel')) Alert.alert('Sign In Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    setIsLoading(true);
    try {
      const { signInWithGoogle } = await import('@/lib/auth-firebase');
      const { token, user } = await signInWithGoogle();
      await storeToken(token);
      setSession(token, user);
    } catch (err) {
      const msg = (err as Error).message ?? 'Google sign-in failed';
      if (!msg.includes('cancel')) Alert.alert('Sign In Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };
```

Add the import for `storeToken` near the existing `import` block:

```ts
import { storeToken } from '@/lib/auth';
```

(Check if it's already imported — many files in this app use it.)

- [ ] **Step 3: Replace the sign-in button JSX**

In the JSX where the existing single "Sign in with Google" button is rendered, replace with two buttons. Apple button only on iOS:

```tsx
            <View>
              {Platform.OS === 'ios' && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={8}
                  style={{ width: '100%', height: 48, marginBottom: 12 }}
                  onPress={handleApple}
                />
              )}
              <Pressable
                disabled={isLoading}
                onPress={handleGoogle}
                style={{
                  height: 48,
                  borderRadius: 8,
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dadce0',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '500', color: '#3c4043' }}>
                  Sign in with Google
                </Text>
              </Pressable>
            </View>
```

Add the import for `AppleAuthentication`:

```ts
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform, Pressable, Text, View } from 'react-native';
```

(`Platform`, `Pressable`, `Text`, `View` are likely already imported — extend the existing import line.)

The Apple button uses Apple's official `AppleAuthenticationButton` component (compliant with Apple HIG branding rules — use this rather than a custom-styled button).

- [ ] **Step 4: Remove the obsolete `WebBrowser` import and old handler if no longer used**

After replacing `handleSignIn`, check if `WebBrowser` is still imported but unused. Remove unused imports.

- [ ] **Step 5: Run typecheck and tests**

```bash
pnpm typecheck
pnpm --filter @rr/mobile test
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add packages/mobile/app/\(tabs\)/settings.tsx
git commit -m "feat(mobile): show Apple + Google sign-in buttons in settings"
```

---

## Task 10: Acceptance verification

This task is a manual checklist run before merge. No code changes.

- [ ] **Step 1: All vitest suites green**

```bash
pnpm test
```

Expected: all packages pass.

- [ ] **Step 2: Typecheck passes**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 3: Web sign-in (Chrome) — both providers**

```bash
pnpm dev
```

In Chrome:
1. Open the dev server URL.
2. Click "Sign in" — confirm both Apple and Google buttons appear.
3. Click "Sign in with Google" — popup opens, complete with a real Google account.
4. Verify the page reloads and the user avatar appears in the navbar.
5. Sign out.
6. Click "Sign in with Apple" — popup opens, complete with a real Apple ID.
7. Verify signed-in state.

- [ ] **Step 4: Web sign-in (Safari) — popup-blocked fallback**

In Safari, repeat step 3 with popups blocked in browser settings. Confirm the redirect fallback path (`signInWithRedirect`) takes the user through Firebase's hosted redirect and back to the app correctly signed in.

- [ ] **Step 5: Existing-Google-user-on-web migration**

Use a Google account that already has a `provider='google'` row in `user_auth_providers`. Sign in via the new Firebase flow. Verify:
1. The user lands in their existing account (bookmarks/collections intact).
2. In D1: `SELECT * FROM user_auth_providers WHERE user_id = '<existing-user-id>'` shows BOTH a `provider='google'` row AND a NEW `provider='firebase'` row.
3. In Firebase console (Authentication → Users): a single user row exists for that account.

- [ ] **Step 6: iOS TestFlight — Apple + Google**

Build for TestFlight:

```bash
cd packages/mobile
eas build --profile preview --platform ios
```

Install the build on a real iOS device (NOT simulator — Apple Sign In requires real device). Test:
1. Settings tab → Sign in with Apple → native sheet appears, complete with Apple ID.
2. Verify signed-in state, name shown, can navigate to Saved.
3. Sign out, sign in with Google.
4. Verify signed-in state again.

- [ ] **Step 7: D1 verification of provider rows**

```bash
npx wrangler d1 execute reduced-recipes-users --remote --config packages/workers/wrangler.api.toml --command "SELECT user_id, provider, provider_id FROM user_auth_providers ORDER BY user_id LIMIT 20"
```

For test accounts created during smoke testing, verify the expected rows: each test user should have exactly one row per provider used (`firebase` plus `google` and/or `apple`).

- [ ] **Step 8: Account deletion still works**

Sign in with a Firebase-linked test account, then delete the account via the existing UI flow (settings → delete account). Verify:
1. The user is signed out.
2. `users` row is gone (cascades to `user_auth_providers`, `bookmarks`, `collections`).

- [ ] **Step 9: Apple HIG branding check**

Open the iOS app on a device. On the sign-in screen, confirm:
1. Sign in with Apple button is at least as prominent (size, position) as Sign in with Google.
2. Apple button uses the official `AppleAuthenticationButton` component (it does — see Task 9 step 3).

- [ ] **Step 10: Approval gate**

If all 9 prior steps pass, the feature is ready to merge. Old PKCE routes remain live for the 3-week stability window — do NOT delete them yet. Cleanup is a separate plan after the window closes.

---

## Out of scope (separate follow-up)

After 3 weeks of stable operation post-deploy, a separate cleanup plan will:

1. Delete `packages/workers/src/lib/google-oauth.ts`.
2. Delete `GET /api/v1/auth/google/url` and `GET /api/v1/auth/google/callback` route handlers in `packages/workers/src/routes/auth.ts`.
3. Remove the `auth-state:*` write paths.
4. Remove `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` from worker secrets if no longer referenced.
5. Update `packages/frontend/src/hooks/useAuth.ts` to remove the now-unused `getGoogleAuthUrl` import and the `inapp-browser-login` event handler if Firebase's flow doesn't need it.

Do not include any of this in the current implementation.
