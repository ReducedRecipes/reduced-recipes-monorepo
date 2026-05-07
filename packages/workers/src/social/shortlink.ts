/**
 * rr-social-shortlink — `r.reduced.recipes` request handler.
 *
 * Three URL patterns under `r.reduced.recipes`:
 *
 *   GET /:draftId            (public)    Log a hit, 302 to recipe page.
 *   GET /approve/:draftId    (CF Access) One-click approve from email digest.
 *   GET /reject/:draftId     (CF Access) One-click reject from email digest.
 *
 * CF Access is configured at the route level in the Cloudflare dashboard;
 * this Worker has no auth logic of its own. The bare `/<draftId>` route
 * stays public so social-platform browsers and crawlers can resolve it.
 *
 * Schema note: the recipes table has no slug column. The redirect target is
 * built from `social_source_candidates.recipe_id` via `recipePageUrl()` from
 * `@rr/social-shared`, never from `recipes.slug`.
 */

import { ulid, recipePageUrl } from '@rr/social-shared';
import { nextPinterestSlot } from './scheduling';

export interface Env {
  DB: D1Database;
}

interface DraftLookup {
  id: string;
  status: string;
  cta_url: string | null;
  source_id: string;
}

async function handleHit(env: Env, draftId: string, req: Request): Promise<Response> {
  const draft = await env.DB
    .prepare('SELECT id, status, cta_url, source_id FROM social_drafts WHERE id = ?')
    .bind(draftId)
    .first<DraftLookup>();
  if (!draft) return new Response('Not found', { status: 404 });

  // Resolve the redirect target. cta_url usually already points to the
  // recipe page, but if it self-references r.reduced.recipes (would loop)
  // or is missing, look up recipe_id from the source candidate row and
  // build the canonical /recipe/${id} URL — frontend has no slug column.
  let target = draft.cta_url ?? '';
  if (!target || target.includes('r.reduced.recipes')) {
    const row = await env.DB
      .prepare('SELECT recipe_id FROM social_source_candidates WHERE id = ?')
      .bind(draft.source_id)
      .first<{ recipe_id: string }>();
    target = row ? recipePageUrl(row.recipe_id) : 'https://reduced.recipes';
  }

  // Log the hit BEFORE redirecting. Single fast INSERT — the few ms cost
  // is acceptable in exchange for guaranteed attribution capture.
  await env.DB
    .prepare(`
      INSERT INTO social_shortlink_hits (id, draft_id, hit_at, country, referer, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      ulid(),
      draftId,
      Date.now(),
      req.headers.get('cf-ipcountry'),
      req.headers.get('referer'),
      req.headers.get('user-agent'),
    )
    .run();

  return Response.redirect(target, 302);
}

async function handleApprove(env: Env, draftId: string): Promise<Response> {
  const draft = await env.DB
    .prepare('SELECT id, status FROM social_drafts WHERE id = ?')
    .bind(draftId)
    .first<{ id: string; status: string }>();
  if (!draft) return new Response('Not found', { status: 404 });

  // Idempotent: re-clicks of an already-decided email link are a no-op.
  if (draft.status === 'approved' || draft.status === 'scheduled') {
    return successPage('Already approved.');
  }
  if (draft.status !== 'pending_approval') {
    return new Response(`Cannot approve from status '${draft.status}'`, { status: 409 });
  }

  const scheduledFor = nextPinterestSlot();
  await env.DB
    .prepare(`
      UPDATE social_drafts
      SET status = 'scheduled', approved_at = ?, scheduled_for = ?
      WHERE id = ? AND status = 'pending_approval'
    `)
    .bind(Date.now(), scheduledFor.getTime(), draftId)
    .run();

  return successPage(`Approved. Will publish around ${scheduledFor.toUTCString()}.`);
}

async function handleReject(env: Env, draftId: string): Promise<Response> {
  // First confirm the draft exists at all so we can return a proper 404.
  const draft = await env.DB
    .prepare('SELECT id, status FROM social_drafts WHERE id = ?')
    .bind(draftId)
    .first<{ id: string; status: string }>();
  if (!draft) return new Response('Not found', { status: 404 });

  // Already-decided rejects use 409 deliberately so retries (an email
  // re-clicked twice) don't silently overwrite a state change.
  const result = await env.DB
    .prepare(`
      UPDATE social_drafts
      SET status = 'rejected', rejection_reason = 'one-click reject from email'
      WHERE id = ? AND status = 'pending_approval'
    `)
    .bind(draftId)
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    return new Response('Already decided', { status: 409 });
  }
  return successPage('Rejected.');
}

function successPage(msg: string): Response {
  return new Response(
    `<!doctype html><html><body style="font-family: system-ui, sans-serif; padding: 40px;">
      <h1>OK</h1><p>${msg}</p><p>You can close this tab.</p>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  );
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);

    if (segments.length === 1) {
      return handleHit(env, segments[0]!, req);
    }
    if (segments.length === 2 && segments[0] === 'approve') {
      return handleApprove(env, segments[1]!);
    }
    if (segments.length === 2 && segments[0] === 'reject') {
      return handleReject(env, segments[1]!);
    }

    return new Response('Not found', { status: 404 });
  },
};
