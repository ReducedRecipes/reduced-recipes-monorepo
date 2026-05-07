/**
 * POST /api/drafts/:id/approve
 *
 * Flips a pending draft to status='scheduled', stamps approved_at, and
 * computes scheduled_for via the next Pinterest slot. 409 when the row
 * isn't in pending_approval (matches shortlink Worker's idempotency).
 */

import { nextPinterestSlot } from '../../_lib/scheduling';

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env, 'id'> = async ({ env, params }) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return new Response('Missing id', { status: 400 });
  }

  const scheduledFor = nextPinterestSlot();
  const result = await env.DB
    .prepare(
      `UPDATE social_drafts
       SET status = 'scheduled', approved_at = ?, scheduled_for = ?
       WHERE id = ? AND status = 'pending_approval'`,
    )
    .bind(Date.now(), scheduledFor.getTime(), id)
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    return new Response('Not found or already decided', { status: 409 });
  }

  return Response.json({ ok: true, scheduledFor: scheduledFor.toISOString() });
};
