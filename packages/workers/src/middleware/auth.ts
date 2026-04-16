import { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Env } from '@rr/shared';

export interface AuthVariables {
  userId: string;
  user: AuthUser;
  sessionToken: string;
}

export type AppEnv = { Bindings: Env; Variables: AuthVariables };

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture_url: string | null;
  profile_public: number;
  tier: string;
  created_at: string;
}

export interface SessionData {
  user_id: string;
  user: AuthUser;
  created_at: string;
  replacement_token?: string;
  replaced_at?: number;
}

/** Extract session token from cookie first, then Authorization Bearer header. */
export function extractToken(c: Context<AppEnv>): string | null {
  const cookie = getCookie(c, 'session');
  if (cookie) return cookie;

  const authHeader = c.req.header('Authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

const SESSION_TTL = 2592000; // 30 days
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const GRACE_PERIOD_MS = 60 * 1000; // 60 seconds

/** Update the reverse index of sessions for a user. */
async function updateSessionIndex(
  kv: KVNamespace,
  userId: string,
  tokenToAdd?: string,
  tokenToRemove?: string,
): Promise<void> {
  const raw = await kv.get(`user-sessions:${userId}`, 'text');
  let tokens: string[] = raw ? JSON.parse(raw) : [];

  if (tokenToRemove) {
    tokens = tokens.filter((t) => t !== tokenToRemove);
  }
  if (tokenToAdd && !tokens.includes(tokenToAdd)) {
    tokens.push(tokenToAdd);
  }

  await kv.put(`user-sessions:${userId}`, JSON.stringify(tokens), { expirationTtl: SESSION_TTL });
}

/** Middleware that blocks requests without a valid session. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = extractToken(c);
  if (!token) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
  }

  const kv = c.env.SESSION_KV!;
  const raw = await kv.get(`session:${token}`, 'text');
  if (!raw) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session' } }, 401);
  }

  const session: SessionData = JSON.parse(raw);

  // Check if this is a grace-period token (old token that was replaced)
  if (session.replacement_token) {
    const elapsed = Date.now() - (session.replaced_at ?? 0);
    if (elapsed < GRACE_PERIOD_MS) {
      // Still in grace period — use the replacement token's session
      const replacementRaw = await kv.get(`session:${session.replacement_token}`, 'text');
      if (replacementRaw) {
        const replacementSession: SessionData = JSON.parse(replacementRaw);
        c.set('userId', replacementSession.user_id);
        c.set('user', replacementSession.user);
        c.set('sessionToken', session.replacement_token);
        await next();
        return;
      }
    }
    // Grace period expired or replacement not found — this token is dead
    await kv.delete(`session:${token}`);
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Session expired' } }, 401);
  }

  // Check if session needs refresh (older than 7 days)
  const sessionAge = Date.now() - new Date(session.created_at).getTime();
  if (sessionAge > REFRESH_AFTER_MS) {
    const newToken = `${crypto.randomUUID()}.${Date.now().toString(16)}`;
    const newSession: SessionData = {
      user_id: session.user_id,
      user: session.user,
      created_at: new Date().toISOString(),
    };

    // Store new session
    await kv.put(`session:${newToken}`, JSON.stringify(newSession), { expirationTtl: SESSION_TTL });

    // Mark old token with grace period
    const gracedSession: SessionData = {
      ...session,
      replacement_token: newToken,
      replaced_at: Date.now(),
    };
    await kv.put(`session:${token}`, JSON.stringify(gracedSession), { expirationTtl: 120 });

    // Update reverse index
    await updateSessionIndex(kv, session.user_id, newToken, token);

    // Set the new token on the response
    const platform = c.req.header('X-Client') ? 'mobile' : 'web';
    if (platform === 'web') {
      setCookie(c, 'session', newToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        maxAge: SESSION_TTL,
        path: '/',
      });
    } else {
      c.header('X-New-Session-Token', newToken);
    }

    c.set('userId', session.user_id);
    c.set('user', session.user);
    c.set('sessionToken', newToken);
  } else {
    c.set('userId', session.user_id);
    c.set('user', session.user);
    c.set('sessionToken', token);
  }

  await next();
};

/** Middleware that attaches user if present but does not block. */
export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = extractToken(c);
  if (token && c.env.SESSION_KV) {
    const raw = await c.env.SESSION_KV.get(`session:${token}`, 'text');
    if (raw) {
      const session: SessionData = JSON.parse(raw);
      if (!session.replacement_token) {
        c.set('userId', session.user_id);
        c.set('user', session.user);
        c.set('sessionToken', token);
      }
    }
  }
  await next();
};

export { updateSessionIndex };
