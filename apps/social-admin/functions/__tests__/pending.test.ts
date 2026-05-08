import { describe, it, expect, vi } from 'vitest';
import { onRequestGet } from '../api/drafts/pending';

interface CapturedBind {
  sql: string;
  bindings: unknown[];
}

interface DbCanned {
  rows?: unknown[];
}

function makeDb(canned: DbCanned) {
  const allBindCalls: CapturedBind[] = [];
  const allCalls: { sql: string; bindings: unknown[] }[] = [];

  const prepare = vi.fn((sql: string) => {
    let pendingBindings: unknown[] = [];
    const handle = {
      bind: vi.fn((...bindings: unknown[]) => {
        pendingBindings = bindings;
        allBindCalls.push({ sql, bindings });
        return handle;
      }),
      all: vi.fn(async () => {
        allCalls.push({ sql, bindings: pendingBindings });
        return { results: canned.rows ?? [], success: true } as unknown as D1Result;
      }),
    };
    return handle;
  });

  return { db: { prepare } as unknown as D1Database, allBindCalls, allCalls };
}

function makeCtx(db: D1Database) {
  return {
    env: { DB: db },
    request: new Request('https://social-admin.reduced.recipes/api/drafts/pending'),
    params: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response()),
    data: {},
  } as unknown as Parameters<typeof onRequestGet>[0];
}

describe('GET /api/drafts/pending', () => {
  it('returns shaped pending drafts with pin preview URL', async () => {
    const { db, allCalls } = makeDb({
      rows: [
        {
          id: 'D1',
          platform: 'pinterest',
          caption: 'A caption',
          hashtags: JSON.stringify(['#food', '#recipe']),
          hook: 'Hook',
          cta_url: 'https://r.reduced.recipes/D1',
          asset_r2_keys: JSON.stringify(['social/D1/hero.jpg', 'social/D1/pin.png']),
          created_at: 1700000000000,
        },
      ],
    });

    const res = await onRequestGet(makeCtx(db));
    expect(res).toBeInstanceOf(Response);
    expect(res!.headers.get('content-type')).toMatch(/application\/json/);
    const body = (await res!.json()) as Array<Record<string, unknown>>;

    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'D1',
      platform: 'pinterest',
      caption: 'A caption',
      hashtags: ['#food', '#recipe'],
      hook: 'Hook',
      ctaUrl: 'https://r.reduced.recipes/D1',
      pinPreviewUrl: 'https://assets.reduced.recipes/social/D1/pin.png',
      videoPreviewUrl: null,
      createdAt: 1700000000000,
    });

    expect(allCalls[0]!.sql).toContain("status = 'pending_approval'");
    expect(allCalls[0]!.sql).toContain('LIMIT 50');
  });

  it('falls back to first asset when no pin.png is present', async () => {
    const { db } = makeDb({
      rows: [
        {
          id: 'D2',
          platform: 'pinterest',
          caption: 'x',
          hashtags: '[]',
          hook: null,
          cta_url: '',
          asset_r2_keys: JSON.stringify(['social/D2/hero.jpg']),
          created_at: 0,
        },
      ],
    });

    const res = await onRequestGet(makeCtx(db));
    const body = (await res!.json()) as Array<Record<string, unknown>>;
    expect(body[0]!.pinPreviewUrl).toBe('https://assets.reduced.recipes/social/D2/hero.jpg');
  });

  it('returns empty array when no rows', async () => {
    const { db } = makeDb({ rows: [] });
    const res = await onRequestGet(makeCtx(db));
    const body = await res!.json();
    expect(body).toEqual([]);
  });

  it('survives malformed JSON columns without throwing', async () => {
    const { db } = makeDb({
      rows: [
        {
          id: 'D3',
          platform: 'pinterest',
          caption: 'x',
          hashtags: 'not-json',
          hook: null,
          cta_url: '',
          asset_r2_keys: 'also-not-json',
          created_at: 0,
        },
      ],
    });
    const res = await onRequestGet(makeCtx(db));
    const body = (await res!.json()) as Array<Record<string, unknown>>;
    expect(body[0]!.hashtags).toEqual([]);
    expect(body[0]!.pinPreviewUrl).toBe('');
  });
});
