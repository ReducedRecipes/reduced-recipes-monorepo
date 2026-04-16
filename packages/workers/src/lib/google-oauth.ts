/**
 * Google OAuth + PKCE helper functions for Phase 1a authentication.
 *
 * - PKCE: code_verifier (43-128 chars), code_challenge = BASE64URL(SHA256(verifier))
 * - State: HMAC-signed nonce using SESSION_SECRET
 * - JWT id_token decoding for user info extraction
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

// ── PKCE ──────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random code verifier (43-128 characters).
 * Uses base64url alphabet: [A-Z, a-z, 0-9, -, _, ~, .].
 */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Compute S256 code challenge: BASE64URL(SHA256(verifier)).
 */
export async function generateCodeChallenge(
  verifier: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

// ── State (HMAC-signed nonce) ─────────────────────────────────────────────

/**
 * Generate an HMAC-signed state parameter: {nonce}.{signature}.
 * The nonce is a random hex string; signature is HMAC-SHA256(nonce, secret).
 */
export async function generateState(secret: string): Promise<string> {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const signature = await hmacSign(nonce, secret);
  return `${nonce}.${signature}`;
}

/**
 * Verify that a state parameter has a valid HMAC signature.
 */
export async function verifyState(
  state: string,
  secret: string,
): Promise<boolean> {
  const dotIndex = state.indexOf('.');
  if (dotIndex === -1) return false;

  const nonce = state.slice(0, dotIndex);
  const signature = state.slice(dotIndex + 1);
  const expected = await hmacSign(nonce, secret);

  return timingSafeEqual(signature, expected);
}

// ── Google Auth URL ───────────────────────────────────────────────────────

export interface GoogleAuthUrlParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}

/**
 * Build the Google OAuth authorization URL with PKCE S256 challenge.
 */
export function buildGoogleAuthUrl(params: GoogleAuthUrlParams): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', params.state);
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

// ── Token Exchange ────────────────────────────────────────────────────────

/**
 * Exchange an authorization code for tokens using the Google token endpoint.
 * Sends code_verifier for PKCE verification.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    code_verifier: codeVerifier,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Google token exchange failed (${response.status}): ${errorBody}`,
    );
  }

  return response.json() as Promise<GoogleTokenResponse>;
}

// ── JWT Decode ────────────────────────────────────────────────────────────

/**
 * Decode the JWT id_token payload to extract user info.
 * Does NOT verify the JWT signature — Google already validated the token
 * during the exchange, and we trust the TLS connection.
 */
export function extractUserInfo(idToken: string): GoogleUserInfo {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT: expected 3 parts');
  }

  const payload = JSON.parse(base64UrlDecode(parts[1]));

  if (!payload.sub || !payload.email) {
    throw new Error('Invalid JWT payload: missing sub or email');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? '',
    picture: payload.picture ?? '',
  };
}

// ── Internal Helpers ──────────────────────────────────────────────────────

function base64UrlEncode(bytes: Uint8Array): string {
  const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (padded.length % 4)) % 4);
  return atob(padded + padding);
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return base64UrlEncode(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}
