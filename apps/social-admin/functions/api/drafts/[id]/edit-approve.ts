/**
 * POST /api/drafts/:id/edit-approve
 *
 * JSON body `{ caption?: string; hashtags?: string[] }`. Patches the
 * caption/hashtags then flips the row to status='scheduled' with
 * approved_at and scheduled_for set. 409 when not in pending_approval.
 */

import { nextPinterestSlot } from '../../_lib/scheduling';

interface Env {
  DB: D1Database;
}

interface EditBody {
  caption?: string;
  hashtags?: string[];
}

export const onRequestPost: PagesFunction<Env, 'id'> = async ({ env, params, request }) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return new Response('Missing id', { status: 400 });
  }

  let body: EditBody = {};
  if (request.headers.get('content-type')?.includes('application/json')) {
    try {
      body = (await request.json()) as EditBody;
    } catch {
      return new Response('Invalid JSON body', { status: 400 });
    }
  }

  const sets: string[] = [];
  const binds: unknown[] = [];

  if (typeof body.caption === 'string') {
    sets.push('caption = ?');
    binds.push(body.caption);
  }
  if (Array.isArray(body.hashtags)) {
    const cleaned = body.hashtags
      .filter((h): h is string => typeof h === 'string')
      .map((h) => h.trim())
      .filter((h) => h.length > 0);
    sets.push('hashtags = ?');
    binds.push(JSON.stringify(cleaned));
  }

  const scheduledFor = nextPinterestSlot();
  sets.push("status = 'scheduled'");
  sets.push('approved_at = ?');
  binds.push(Date.now());
  sets.push('scheduled_for = ?');
  binds.push(scheduledFor.getTime());

  binds.push(id);

  const sql =
    `UPDATE social_drafts SET ${sets.join(', ')} WHERE id = ? AND status = 'pending_approval'`;

  const result = await env.DB.prepare(sql).bind(...binds).run();

  if ((result.meta?.changes ?? 0) === 0) {
    return new Response('Not found or already decided', { status: 409 });
  }

  return Response.json({ ok: true, scheduledFor: scheduledFor.toISOString() });
};
