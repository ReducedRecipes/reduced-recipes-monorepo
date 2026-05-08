import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@rr/social-shared/platforms/pinterest-auth', () => ({
  startOauth: vi.fn(async () => Response.redirect('https://pinterest.com/oauth/?test=1', 302)),
  callback: vi.fn(async () => new Response('connected', { status: 200 })),
}));

import { onRequestGet as startHandler } from '../oauth/pinterest/start';
import { onRequestGet as callbackHandler } from '../oauth/pinterest/callback';
import { startOauth, callback } from '@rr/social-shared/platforms/pinterest-auth';

describe('OAuth Pages Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('start delegates to startOauth(env)', async () => {
    const env = { fake: true } as unknown as Parameters<typeof startHandler>[0]['env'];
    const ctx = {
      env,
      request: new Request('https://social-admin.reduced.recipes/oauth/pinterest/start'),
      params: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response()),
      data: {},
    } as unknown as Parameters<typeof startHandler>[0];

    const res = await startHandler(ctx);
    expect(res!.status).toBe(302);
    expect(startOauth).toHaveBeenCalledTimes(1);
    expect(startOauth).toHaveBeenCalledWith(env);
  });

  it('callback delegates to callback(request, env)', async () => {
    const env = { fake: true } as unknown as Parameters<typeof callbackHandler>[0]['env'];
    const request = new Request(
      'https://social-admin.reduced.recipes/oauth/pinterest/callback?code=abc&state=xyz',
    );
    const ctx = {
      env,
      request,
      params: {},
      waitUntil: () => undefined,
      next: () => Promise.resolve(new Response()),
      data: {},
    } as unknown as Parameters<typeof callbackHandler>[0];

    const res = await callbackHandler(ctx);
    expect(res!.status).toBe(200);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(request, env);
  });
});
