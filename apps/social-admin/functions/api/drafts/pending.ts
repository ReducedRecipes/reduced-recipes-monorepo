/**
 * GET /api/drafts/pending
 *
 * Returns up to 50 social_drafts rows with status='pending_approval', shaped
 * for the swipe UI. Resolves the pin preview URL from the JSON-encoded
 * `asset_r2_keys` column (preferring keys ending in `/pin.png`).
 *
 * Auth: Cloudflare Access fronts the route. No in-app auth.
 */

interface Env {
  DB: D1Database;
}

interface DraftRow {
  id: string;
  platform: string;
  caption: string;
  hashtags: string;
  hook: string | null;
  cta_url: string;
  asset_r2_keys: string;
  created_at: number;
}

const ASSET_BASE = 'https://assets.reduced.recipes';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const r = await env.DB
    .prepare(
      `SELECT id, platform, caption, hashtags, hook, cta_url, asset_r2_keys, created_at
       FROM social_drafts
       WHERE status = 'pending_approval'
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all<DraftRow>();

  const out = (r.results ?? []).map((d) => {
    let keys: string[] = [];
    try {
      const parsed = JSON.parse(d.asset_r2_keys);
      keys = Array.isArray(parsed) ? parsed : [];
    } catch {
      keys = [];
    }
    let hashtags: string[] = [];
    try {
      const parsed = JSON.parse(d.hashtags);
      hashtags = Array.isArray(parsed) ? parsed : [];
    } catch {
      hashtags = [];
    }
    const pinKey = keys.find((k) => k.endsWith('/pin.png')) ?? keys[0] ?? null;

    return {
      id: d.id,
      platform: d.platform,
      caption: d.caption,
      hashtags,
      hook: d.hook,
      ctaUrl: d.cta_url,
      pinPreviewUrl: pinKey ? `${ASSET_BASE}/${pinKey}` : '',
      videoPreviewUrl: null,
      createdAt: d.created_at,
    };
  });

  return Response.json(out);
};
