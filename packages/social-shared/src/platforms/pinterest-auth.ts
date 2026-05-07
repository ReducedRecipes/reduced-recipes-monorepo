import { ulid } from '../ulid';
import type { PinterestTokenBundle } from '../types';

// Re-export for convenience so callers can:
//   import { PinterestTokenBundle } from '@rr/social-shared/platforms/pinterest-auth';
// (canonical home is `@rr/social-shared/types`).
export type { PinterestTokenBundle };

const KV_KEY = 'pinterest:default';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const SCOPES = 'boards:read,boards:write,pins:read,pins:write,user_accounts:read';

export interface PinterestAuthEnv {
  RR_SOCIAL_TOKENS: KVNamespace;
  PINTEREST_CLIENT_ID: string;
  PINTEREST_CLIENT_SECRET: string;
}

export interface OauthEnv extends PinterestAuthEnv {
  RR_SOCIAL_OAUTH_STATE: KVNamespace;
  PINTEREST_REDIRECT_URI: string;
}

export async function getValidPinterestAccessToken(env: PinterestAuthEnv): Promise<string> {
  const stored = await env.RR_SOCIAL_TOKENS.get<PinterestTokenBundle>(KV_KEY, 'json');
  if (!stored) throw new Error('Pinterest tokens not bootstrapped. Run /oauth/pinterest/start.');

  if (stored.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return stored.accessToken;
  }

  const refreshed = await refresh(env, stored.refreshToken);
  await env.RR_SOCIAL_TOKENS.put(KV_KEY, JSON.stringify(refreshed));
  return refreshed.accessToken;
}

async function refresh(env: PinterestAuthEnv, refreshToken: string): Promise<PinterestTokenBundle> {
  const basic = btoa(`${env.PINTEREST_CLIENT_ID}:${env.PINTEREST_CLIENT_SECRET}`);
  const r = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!r.ok) throw new Error(`Pinterest token refresh failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  const now = Date.now();
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? refreshToken,
    expiresAt: now + j.expires_in * 1000,
    scope: j.scope,
    obtainedAt: now,
  };
}

export async function startOauth(env: OauthEnv): Promise<Response> {
  const state = ulid();
  const verifier = randomString(64);
  const challenge = await s256(verifier);

  await env.RR_SOCIAL_OAUTH_STATE.put(`pkce:${state}`, verifier, { expirationTtl: 300 });

  const authUrl = new URL('https://www.pinterest.com/oauth/');
  authUrl.searchParams.set('client_id', env.PINTEREST_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', env.PINTEREST_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return Response.redirect(authUrl.toString(), 302);
}

export async function callback(req: Request, env: OauthEnv): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return new Response('Missing code or state', { status: 400 });

  const verifier = await env.RR_SOCIAL_OAUTH_STATE.get(`pkce:${state}`);
  if (!verifier) return new Response('OAuth state expired or unknown', { status: 400 });
  await env.RR_SOCIAL_OAUTH_STATE.delete(`pkce:${state}`);

  const basic = btoa(`${env.PINTEREST_CLIENT_ID}:${env.PINTEREST_CLIENT_SECRET}`);
  const r = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.PINTEREST_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  if (!r.ok) return new Response(`Token exchange failed: ${r.status} ${await r.text()}`, { status: 502 });

  const j = (await r.json()) as { access_token: string; refresh_token: string; expires_in: number; scope: string };
  const now = Date.now();
  const bundle: PinterestTokenBundle = {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: now + j.expires_in * 1000,
    scope: j.scope,
    obtainedAt: now,
  };
  await env.RR_SOCIAL_TOKENS.put(KV_KEY, JSON.stringify(bundle));

  return new Response('Pinterest connected. You can close this tab.', { status: 200 });
}

function randomString(len: number): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(36)).join('').slice(0, len);
}

async function s256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
