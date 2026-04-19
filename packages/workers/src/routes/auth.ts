/**
 * Auth routes — Google SSO with PKCE (Phase 1a).
 *
 * GET  /api/v1/auth/google/url      — Generate Google OAuth URL with PKCE
 * GET  /api/v1/auth/google/callback  — Handle OAuth callback, upsert user, create session
 * POST /api/v1/auth/logout           — Destroy session
 * GET  /api/v1/auth/me               — Return current user
 */

import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import type { Env } from '@rr/shared/env';
import type { User } from '@rr/shared';
import { requireAuth } from '../middleware/auth';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  verifyState,
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  extractUserInfo,
} from '../lib/google-oauth';
import { createSession, deleteSession } from '../lib/session';

type AuthEnv = { Bindings: Env; Variables: { userId: string; user: User } };

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const AUTH_STATE_TTL = 600; // 10 minutes
const SESSION_TTL = 30 * 24 * 60 * 60; // 30 days

const SAFE_MOBILE_SCHEME = 'reducedrecipes://';
const DEFAULT_RETURN_TO = '/';
const DEFAULT_MOBILE_RETURN_TO = 'reducedrecipes://auth/callback';

/**
 * Validate return_to to prevent open redirect attacks.
 * Allows relative paths and the app deep link scheme only.
 */
export function validateReturnTo(returnTo: string, platform: string): string {
  if (!returnTo) {
    return platform === 'mobile' ? DEFAULT_MOBILE_RETURN_TO : DEFAULT_RETURN_TO;
  }

  // Allow relative paths (must start with /)
  if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    return returnTo;
  }

  // Allow mobile deep link scheme
  if (platform === 'mobile' && returnTo.startsWith(SAFE_MOBILE_SCHEME)) {
    return returnTo;
  }

  // Allow known frontend origins
  try {
    const url = new URL(returnTo);
    if (
      url.hostname === 'reducedrecipes.com' ||
      url.hostname.endsWith('.reduced-recipes.pages.dev') ||
      url.hostname === 'localhost'
    ) {
      return returnTo;
    }
  } catch {
    // invalid URL — fall through to default
  }

  // Reject everything else (external URLs, protocol-relative, javascript:, etc.)
  return platform === 'mobile' ? DEFAULT_MOBILE_RETURN_TO : DEFAULT_RETURN_TO;
}

const auth = new Hono<AuthEnv>();

// ── GET /api/v1/auth/google/url ──────────────────────────────────────────
auth.get('/api/v1/auth/google/url', async (c) => {
  const platform = c.req.query('platform') || 'web';
  const return_to = validateReturnTo(c.req.query('return_to') || '', platform);
  const intent = c.req.query('intent') || '';

  const sessionSecret = c.env.SESSION_SECRET;
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const redirectUri = c.env.GOOGLE_REDIRECT_URI;
  const sessionKV = c.env.SESSION_KV;

  if (!sessionSecret || !clientId || !redirectUri || !sessionKV) {
    return c.json({ error: { code: 'SERVER_ERROR', message: 'Auth not configured' } }, 500);
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = await generateState(sessionSecret);

  // Store auth state in SESSION_KV with 10-min TTL
  await sessionKV.put(
    `auth-state:${state}`,
    JSON.stringify({ code_verifier: codeVerifier, platform, return_to, intent }),
    { expirationTtl: AUTH_STATE_TTL },
  );

  const url = buildGoogleAuthUrl({
    clientId,
    redirectUri,
    codeChallenge,
    state,
  });

  return c.json({ url });
});

// ── GET /api/v1/auth/google/callback ─────────────────────────────────────
auth.get('/api/v1/auth/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'Missing code or state' } }, 400);
  }

  const sessionSecret = c.env.SESSION_SECRET;
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = c.env.GOOGLE_REDIRECT_URI;
  const sessionKV = c.env.SESSION_KV;
  const usersDB = c.env.USERS_DB;

  if (!sessionSecret || !clientId || !clientSecret || !redirectUri || !sessionKV || !usersDB) {
    return c.json({ error: { code: 'SERVER_ERROR', message: 'Auth not configured' } }, 500);
  }

  // Verify HMAC state
  const validState = await verifyState(state, sessionSecret);
  if (!validState) {
    return c.json({ error: { code: 'INVALID_STATE', message: 'Invalid or tampered state' } }, 400);
  }

  // Retrieve and delete auth state
  const authStateRaw = await sessionKV.get(`auth-state:${state}`);
  if (!authStateRaw) {
    return c.json({ error: { code: 'EXPIRED_STATE', message: 'Auth state expired' } }, 400);
  }
  await sessionKV.delete(`auth-state:${state}`);

  const authState = JSON.parse(authStateRaw) as {
    code_verifier: string;
    platform: string;
    return_to: string;
    intent: string;
  };

  // Exchange code + code_verifier for tokens
  const tokens = await exchangeCodeForTokens(
    code,
    authState.code_verifier,
    clientId,
    clientSecret,
    redirectUri,
  );

  // Extract user info from id_token
  const googleUser = extractUserInfo(tokens.id_token);

  // Upsert user
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Try INSERT first, fall back to existing user
  const insertResult = await usersDB
    .prepare(
      `INSERT INTO users (id, email, name, picture_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         name = excluded.name,
         picture_url = excluded.picture_url,
         updated_at = excluded.updated_at
       RETURNING id, email, name, picture_url, profile_public, tier, created_at, updated_at`,
    )
    .bind(userId, googleUser.email, googleUser.name, googleUser.picture, now, now)
    .first<User>();

  if (!insertResult) {
    return c.json({ error: { code: 'SERVER_ERROR', message: 'Failed to upsert user' } }, 500);
  }

  const user = insertResult;
  const isNewUser = user.id === userId; // If our generated UUID was used, user is new

  // Upsert auth provider
  await usersDB
    .prepare(
      `INSERT INTO user_auth_providers (user_id, provider, provider_id, provider_email, provider_name, provider_avatar)
       VALUES (?, 'google', ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         provider_email = excluded.provider_email,
         provider_name = excluded.provider_name,
         provider_avatar = excluded.provider_avatar`,
    )
    .bind(user.id, googleUser.sub, googleUser.email, googleUser.name, googleUser.picture)
    .run();

  // Create default "Saved" collection for new users
  if (isNewUser) {
    const collectionId = crypto.randomUUID();
    await usersDB
      .prepare(
        `INSERT INTO collections (id, user_id, name, is_default, position)
         VALUES (?, ?, 'Saved', 1, 0)`,
      )
      .bind(collectionId, user.id)
      .run();
  }

  // Record GDPR consent
  await usersDB
    .prepare(
      `INSERT INTO consent_records (user_id, consent_type, granted, ip_address, user_agent)
       VALUES (?, 'terms_of_service', 1, ?, ?)`,
    )
    .bind(
      user.id,
      c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '',
      c.req.header('User-Agent') || '',
    )
    .run();

  // Create session
  const { token: sessionToken } = await createSession(sessionKV, user.id);

  // Platform-aware response — re-validate return_to (defense in depth)
  if (authState.platform === 'mobile') {
    const returnTo = validateReturnTo(authState.return_to, 'mobile');
    const sep = returnTo.includes('?') ? '&' : '?';
    const mobileRedirect = `${returnTo}${sep}token=${sessionToken}&is_new_user=${isNewUser}`;
    return c.redirect(mobileRedirect, 302);
  }

  // Web: redirect with cookie
  setCookie(c, 'session', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  const returnTo = validateReturnTo(authState.return_to, 'web');
  const separator = returnTo.includes('?') ? '&' : '?';
  const redirectUrl = `${returnTo}${separator}status=success&is_new_user=${isNewUser}&session_token=${sessionToken}`;
  return c.redirect(redirectUrl, 302);
});

// ── POST /api/v1/auth/logout ─────────────────────────────────────────────
auth.post('/api/v1/auth/logout', requireAuth, async (c) => {
  const sessionKV = c.env.SESSION_KV;
  if (!sessionKV) {
    return c.json({ error: { code: 'SERVER_ERROR', message: 'Auth not configured' } }, 500);
  }

  const userId = c.get('userId');

  // Extract token to delete
  const cookie = c.req.header('Cookie') || '';
  const sessionMatch = cookie.match(/session=([^;]+)/);
  const authHeader = c.req.header('Authorization') || '';
  const token = sessionMatch?.[1] || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '');

  if (token) {
    await deleteSession(sessionKV, token, userId);
  }

  // Clear cookie for web
  setCookie(c, 'session', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 0,
    path: '/',
  });

  return c.json({ ok: true });
});

// ── GET /api/v1/auth/me ──────────────────────────────────────────────────
auth.get('/api/v1/auth/me', requireAuth, async (c) => {
  const user = c.get('user');
  return c.json({ user });
});

export default auth;
