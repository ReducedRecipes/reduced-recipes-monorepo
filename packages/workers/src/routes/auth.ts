import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '@rr/shared';
import { requireAuth, extractToken, updateSessionIndex } from '../middleware/auth';
import type { AuthUser, SessionData, AppEnv } from '../middleware/auth';

const SESSION_TTL = 2592000; // 30 days

const auth = new Hono<AppEnv>();

// ── Helpers ──────────────────────────────────────────────────────────────

function base64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return base64url(sig);
}

async function hmacVerify(secret: string, data: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(secret, data);
  return expected === signature;
}

// ── GET /api/v1/auth/google/url ──────────────────────────────────────────

auth.get('/api/v1/auth/google/url', async (c) => {
  const platform = c.req.query('platform') ?? 'web';
  const return_to = c.req.query('return_to') ?? '/';
  const intent = c.req.query('intent') ?? '';

  // Generate state = nonce.hmac
  const nonce = crypto.randomUUID();
  const signature = await hmacSign(c.env.SESSION_SECRET!, nonce);
  const state = `${nonce}.${signature}`;

  // Generate PKCE code_verifier and code_challenge
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const code_verifier = base64url(verifierBytes.buffer);

  const challengeHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code_verifier));
  const code_challenge = base64url(challengeHash);

  // Store auth state in SESSION_KV
  await c.env.SESSION_KV!.put(
    `auth-state:${state}`,
    JSON.stringify({ code_verifier, platform, return_to, intent }),
    { expirationTtl: 600 },
  );

  // Build Google OAuth URL
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!,
    redirect_uri: c.env.GOOGLE_REDIRECT_URI!,
    scope: 'openid email profile',
    response_type: 'code',
    state,
    code_challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return c.json({ url });
});

// ── GET /api/v1/auth/google/callback ─────────────────────────────────────

auth.get('/api/v1/auth/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'Missing code or state' } }, 400);
  }

  // Verify state HMAC
  const dotIndex = state.lastIndexOf('.');
  if (dotIndex === -1) {
    return c.json({ error: { code: 'INVALID_STATE', message: 'Malformed state parameter' } }, 400);
  }
  const nonce = state.slice(0, dotIndex);
  const sig = state.slice(dotIndex + 1);

  const valid = await hmacVerify(c.env.SESSION_SECRET!, nonce, sig);
  if (!valid) {
    return c.json({ error: { code: 'INVALID_STATE', message: 'Invalid state signature' } }, 400);
  }

  // Retrieve and delete auth state
  const kv = c.env.SESSION_KV!;
  const authStateRaw = await kv.get(`auth-state:${state}`, 'text');
  if (!authStateRaw) {
    return c.json({ error: { code: 'EXPIRED_STATE', message: 'Auth state expired or already used' } }, 400);
  }
  await kv.delete(`auth-state:${state}`);

  const authState = JSON.parse(authStateRaw) as {
    code_verifier: string;
    platform: string;
    return_to: string;
    intent: string;
  };

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: c.env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
      code_verifier: authState.code_verifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    return c.json({ error: { code: 'TOKEN_EXCHANGE_FAILED', message: 'Failed to exchange code for tokens' } }, 502);
  }

  const tokens = (await tokenRes.json()) as { access_token: string };

  // Get user info from Google
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    return c.json({ error: { code: 'USERINFO_FAILED', message: 'Failed to fetch user info' } }, 502);
  }

  const googleUser = (await userInfoRes.json()) as {
    sub: string;
    email: string;
    name: string;
    picture: string;
  };

  // UPSERT user in DB
  const db = c.env.USERS_DB!;
  const now = new Date().toISOString();

  // Check if user already exists by provider
  const existingAuth = await db
    .prepare('SELECT user_id FROM user_auth_providers WHERE provider = ? AND provider_id = ?')
    .bind('google', googleUser.sub)
    .first<{ user_id: string }>();

  let userId: string;
  let is_new_user = false;

  if (existingAuth) {
    userId = existingAuth.user_id;

    // Update provider info
    await db
      .prepare(
        'UPDATE user_auth_providers SET provider_email = ?, provider_name = ?, provider_avatar = ? WHERE provider = ? AND provider_id = ?',
      )
      .bind(googleUser.email, googleUser.name, googleUser.picture, 'google', googleUser.sub)
      .run();

    // Update user last activity
    await db.prepare('UPDATE users SET updated_at = ? WHERE id = ?').bind(now, userId).run();
  } else {
    userId = crypto.randomUUID();
    is_new_user = true;

    // Insert new user
    await db
      .prepare(
        'INSERT INTO users (id, email, name, picture_url, profile_public, tier, created_at, updated_at) VALUES (?, ?, ?, ?, 1, \'free\', ?, ?)',
      )
      .bind(userId, googleUser.email, googleUser.name, googleUser.picture, now, now)
      .run();

    // Insert auth provider link
    await db
      .prepare(
        'INSERT INTO user_auth_providers (user_id, provider, provider_id, provider_email, provider_name, provider_avatar) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(userId, 'google', googleUser.sub, googleUser.email, googleUser.name, googleUser.picture)
      .run();

    // Create default "Saved" collection
    await db
      .prepare(
        'INSERT INTO collections (id, user_id, name, is_default, is_public, position, created_at, updated_at) VALUES (?, ?, ?, 1, 0, 0, ?, ?)',
      )
      .bind(crypto.randomUUID(), userId, 'Saved', now, now)
      .run();
  }

  // Build AuthUser
  const user: AuthUser = {
    id: userId,
    email: googleUser.email,
    name: googleUser.name,
    picture_url: googleUser.picture,
    profile_public: 1,
    tier: 'free',
    created_at: is_new_user ? now : (await db.prepare('SELECT created_at FROM users WHERE id = ?').bind(userId).first<{ created_at: string }>())?.created_at ?? now,
  };

  // Generate session token
  const session_token = `${crypto.randomUUID()}.${Date.now().toString(16)}`;
  const sessionData: SessionData = {
    user_id: userId,
    user,
    created_at: now,
  };

  await kv.put(`session:${session_token}`, JSON.stringify(sessionData), { expirationTtl: SESSION_TTL });
  await updateSessionIndex(kv, userId, session_token);

  // Record GDPR consent
  await db
    .prepare(
      'INSERT INTO consent_records (id, user_id, consent_type, granted, ip_address, user_agent, created_at) VALUES (?, ?, ?, 1, ?, ?, ?)',
    )
    .bind(
      crypto.randomUUID(),
      userId,
      'terms_of_service',
      c.req.header('CF-Connecting-IP') ?? 'unknown',
      c.req.header('User-Agent') ?? 'unknown',
      now,
    )
    .run();

  // Platform-specific response
  if (authState.platform === 'mobile') {
    return c.json({
      session_token,
      user,
      is_new_user,
      intent: authState.intent ? authState.intent : undefined,
    });
  }

  // Web: redirect with Set-Cookie
  setCookie(c, 'session', session_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: SESSION_TTL,
    path: '/',
  });

  return c.redirect(authState.return_to || '/');
});

// ── POST /api/v1/auth/logout ─────────────────────────────────────────────

auth.post('/api/v1/auth/logout', requireAuth, async (c) => {
  const token = c.get('sessionToken') as string;
  const userId = c.get('userId') as string;
  const kv = c.env.SESSION_KV!;

  // Delete session
  await kv.delete(`session:${token}`);

  // Remove from reverse index
  await updateSessionIndex(kv, userId, undefined, token);

  // Clear cookie
  deleteCookie(c, 'session', { path: '/' });

  return c.json({ ok: true });
});

// ── GET /api/v1/auth/me ──────────────────────────────────────────────────

auth.get('/api/v1/auth/me', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  return c.json({ user });
});

export default auth;
