/**
 * Firebase ID token verifier: JWKS-based, cached in CACHE_KV.
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
  const ttl = maxAge?.[1] ? parseInt(maxAge[1], 10) : DEFAULT_TTL_SECONDS;

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
