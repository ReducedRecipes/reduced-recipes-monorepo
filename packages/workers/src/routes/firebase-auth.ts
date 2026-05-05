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
 * 3. users.email match, only if email_verified=true (auto-link)
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
  // Provider name from this token. Pass through as-is (incl. null) so the
  // COALESCE upsert preserves the stored value when Apple omits name on
  // subsequent sign-ins. A separate fallback applies only when creating a new
  // user, where we need *some* name in the users table.
  const providerDisplayName = payload.name ?? null;
  const newUserDisplayName = payload.name ?? email ?? 'User';

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
      .bind(userId, email, newUserDisplayName, payload.picture ?? null, now, now)
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

  // 5. Upsert provider rows.
  // COALESCE preserves stored values when Apple/Google omit them on subsequent
  // sign-ins (Apple in particular only sends name/email on first sign-in).
  await usersDB
    .prepare(
      `INSERT INTO user_auth_providers (user_id, provider, provider_id, provider_email, provider_name, provider_avatar)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         provider_email = COALESCE(excluded.provider_email, provider_email),
         provider_name = COALESCE(excluded.provider_name, provider_name),
         provider_avatar = COALESCE(excluded.provider_avatar, provider_avatar)`,
    )
    .bind(userId, providerName, providerSub, email, providerDisplayName, payload.picture ?? null)
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
    .bind(userId, firebaseUid, email, providerDisplayName, payload.picture ?? null)
    .run();

  // 6. Refresh users.updated_at for returning users (skipped on isNewUser since INSERT already set it).
  if (!isNewUser) {
    await usersDB
      .prepare(`UPDATE users SET updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), userId)
      .run();
  }

  // 7. Fetch the canonical user row so the response reflects DB-side defaults
  // (profile_public=1, tier='free') rather than relying on hand-rolled values
  // that can drift from the schema.
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

  // 8. Create session.
  const { token } = await createSession(sessionKV, userId);

  // 9. Set cookie for web (mobile reads token from JSON body).
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
