/**
 * POST /api/drafts/:id/reject
 *
 * Flips a pending draft to status='rejected'. Optional JSON body
 * `{ reason?: string }` is written to rejection_reason. 409 when the row
 * isn't in pending_approval.
 */

interface Env {
  DB: D1Database;
}

interface RejectBody {
  reason?: string;
}

export const onRequestPost: PagesFunction<Env, 'id'> = async ({ env, params, request }) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return new Response('Missing id', { status: 400 });
  }

  let reason: string | null = null;
  if (request.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = (await request.json()) as RejectBody;
      if (typeof body?.reason === 'string' && body.reason.trim().length > 0) {
        reason = body.reason.trim();
      }
    } catch {
      // empty body is fine
    }
  }

  const result = await env.DB
    .prepare(
      `UPDATE social_drafts
       SET status = 'rejected', rejection_reason = ?
       WHERE id = ? AND status = 'pending_approval'`,
    )
    .bind(reason ?? 'rejected via swipe admin', id)
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    return new Response('Not found or already decided', { status: 409 });
  }

  return Response.json({ ok: true });
};
