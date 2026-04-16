/**
 * Auth middleware for Phase 1a — requireAuth and optionalAuth.
 *
 * Token extraction: cookie first, then Bearer header.
 * Session refresh: after 7 days, issue new token with 60s grace on old.
 */

import { getCookie, setCookie } from 'hono/cookie';
import type { Context, MiddlewareHandler } from 'hono';
import type { Env, User } from '@rr/shared';
import {
  getSession,
  createSession,
  updateSessionIndex,
  type Session,
  type GraceSession,
} from '../lib/session';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const GRACE_TTL = 60; // 60 seconds
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

type AuthEnv = { Bindings: Env; Variables: { userId: string; user: User } };

function extractToken(c: Context): string | undefined {
  // Try cookie first
  const cookie = getCookie(c, 'session');
  if (cookie) return cookie;

  // Fallback to Bearer header
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return undefined;
}

function isGraceSession(s: Session | GraceSession): s is GraceSession {
  return 'replacement_token' in s;
}

async function resolveSession(
  kv: KVNamespace,
  token: string,
): Promise<{ session: Session; token: string } | null> {
  const result = await getSession(kv, token);
  if (!result) return null;

  if (isGraceSession(result)) {
    // Follow the replacement token
    const newResult = await getSession(kv, result.replacement_token);
    if (!newResult || isGraceSession(newResult)) return null;
    return { session: newResult, token: result.replacement_token };
  }

  return { session: result, token };
}

async function fetchUser(db: D1Database, userId: string): Promise<User | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first();
  return row ? (row as unknown as User) : null;
}

async function refreshSessionIfNeeded(
  c: Context,
  kv: KVNamespace,
  session: Session,
  currentToken: string,
): Promise<void> {
  const age = Date.now() - session.created_at;
  if (age < SEVEN_DAYS_MS) return;

  // Create new session
  const { token: newToken } = await createSession(kv, session.user_id);

  // Set grace period on old token (60s TTL pointing to new token)
  await kv.put(
    `session:${currentToken}`,
    JSON.stringify({ replacement_token: newToken }),
    { expirationTtl: GRACE_TTL },
  );

  // Update reverse index
  await updateSessionIndex(kv, session.user_id, currentToken, newToken);

  // Deliver new token: cookie for web, header for mobile
  const existingCookie = getCookie(c, 'session');
  if (existingCookie) {
    setCookie(c, 'session', newToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
  } else {
    c.header('X-New-Session-Token', newToken);
  }
}

/**
 * Middleware that requires a valid session. Returns 401 if not authenticated.
 * Sets c.set('userId') and c.set('user') on success.
 */
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const sessionKV = c.env.SESSION_KV;
  const usersDB = c.env.USERS_DB;

  if (!sessionKV || !usersDB) {
    return c.json({ error: { code: 'server_error', message: 'Auth not configured' } }, 500);
  }

  const token = extractToken(c);
  if (!token) {
    return c.json({ error: { code: 'unauthorized', message: 'Authentication required' } }, 401);
  }

  const resolved = await resolveSession(sessionKV, token);
  if (!resolved) {
    return c.json({ error: { code: 'unauthorized', message: 'Session expired or invalid' } }, 401);
  }

  const user = await fetchUser(usersDB, resolved.session.user_id);
  if (!user) {
    return c.json({ error: { code: 'unauthorized', message: 'User not found' } }, 401);
  }

  c.set('userId', user.id);
  c.set('user', user);

  await refreshSessionIfNeeded(c, sessionKV, resolved.session, resolved.token);

  await next();
};

/**
 * Middleware that optionally attaches user if a valid session exists.
 * Does NOT block — proceeds without user if no auth present.
 */
export const optionalAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const sessionKV = c.env.SESSION_KV;
  const usersDB = c.env.USERS_DB;

  if (!sessionKV || !usersDB) {
    await next();
    return;
  }

  const token = extractToken(c);
  if (!token) {
    await next();
    return;
  }

  const resolved = await resolveSession(sessionKV, token);
  if (!resolved) {
    await next();
    return;
  }

  const user = await fetchUser(usersDB, resolved.session.user_id);
  if (user) {
    c.set('userId', user.id);
    c.set('user', user);
    await refreshSessionIfNeeded(c, sessionKV, resolved.session, resolved.token);
  }

  await next();
};
