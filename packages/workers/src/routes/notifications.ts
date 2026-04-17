import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import type { Notification } from '@rr/shared';
import { requireAuth } from '../middleware/auth';

type AuthEnv = { Bindings: Env; Variables: { userId: string } };

const notifications = new Hono<AuthEnv>();

// GET /api/v1/notifications — list user's notifications with cursor pagination
notifications.get('/api/v1/notifications', requireAuth, async (c) => {
  const userId = c.get('userId');
  const cursor = c.req.query('cursor');
  const limitParam = c.req.query('limit');
  const limit = Math.min(Math.max(parseInt(limitParam || '25', 10) || 25, 1), 100);

  const conditions = ['user_id = ?'];
  const params: (string | number)[] = [userId];

  if (cursor) {
    conditions.push('created_at < ?');
    params.push(cursor);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  params.push(limit + 1);

  const result = await c.env.USERS_DB!.prepare(
    `SELECT id, user_id, type, payload, read, created_at
     FROM notifications ${whereClause}
     ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(...params)
    .all();

  const rows = (result.results ?? []) as unknown as Notification[];

  let next_cursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    const last = rows[rows.length - 1];
    if (last) next_cursor = last.created_at;
  }

  return c.json({ items: rows, next_cursor });
});

// POST /api/v1/notifications/:id/read — mark a single notification as read
notifications.post('/api/v1/notifications/:id/read', requireAuth, async (c) => {
  const userId = c.get('userId');
  const notificationId = c.req.param('id');

  const existing = await c.env.USERS_DB!.prepare(
    'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
  )
    .bind(notificationId, userId)
    .first();

  if (!existing) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Notification not found' } },
      404,
    );
  }

  await c.env.USERS_DB!.prepare(
    'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?',
  )
    .bind(notificationId, userId)
    .run();

  return c.json({ ok: true });
});

// POST /api/v1/notifications/read-all — mark all unread notifications as read
notifications.post('/api/v1/notifications/read-all', requireAuth, async (c) => {
  const userId = c.get('userId');

  await c.env.USERS_DB!.prepare(
    'UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0',
  )
    .bind(userId)
    .run();

  return c.json({ ok: true });
});

// GET /api/v1/notifications/unread-count — get count of unread notifications
notifications.get('/api/v1/notifications/unread-count', requireAuth, async (c) => {
  const userId = c.get('userId');

  const row = await c.env.USERS_DB!.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0',
  )
    .bind(userId)
    .first<{ count: number }>();

  return c.json({ count: row?.count ?? 0 });
});

export default notifications;
