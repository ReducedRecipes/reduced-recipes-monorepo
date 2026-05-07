import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailNotifier } from './email-notifier';

describe('EmailNotifier', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('OK', { status: 200 }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('posts a MailChannels payload for daily digest', async () => {
    const notifier = new EmailNotifier({
      NOTIFIER_FROM: 'social-bot@reduced.recipes',
      NOTIFIER_TO: 'owner@example.com',
    });

    await notifier.sendDailyDigest({
      drafts: [{ id: '01HABC', platform: 'pinterest', hook: 'Test pin', status: 'pending_approval' }],
      approveBaseUrl: 'https://social-admin.reduced.recipes',
      oneClickApproveBaseUrl: 'https://r.reduced.recipes',
      date: '2026-05-06',
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe('https://api.mailchannels.net/tx/v1/send');
    const body = JSON.parse(init.body as string);
    expect(body.subject).toContain('1 social drafts ready');
    expect(body.personalizations[0].to[0].email).toBe('owner@example.com');
  });

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Bad', { status: 500 }));
    const notifier = new EmailNotifier({ NOTIFIER_FROM: 'x@y', NOTIFIER_TO: 'z@y' });
    await expect(notifier.sendAlert({ level: 'error', subject: 's', body: 'b' })).rejects.toThrow(/500/);
  });
});
