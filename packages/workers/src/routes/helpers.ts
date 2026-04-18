import type { Context } from 'hono';

/**
 * Parse cursor pagination query params from a Hono request.
 * Used across bookmarks, collections, and user follow endpoints.
 */
export function parseCursorPagination(c: Context): {
  limit: number;
  cursor: string | null;
  limitPlusOne: number;
} {
  const cursor = c.req.query('cursor') || null;
  const limitParam = c.req.query('limit');
  const limit = Math.min(Math.max(parseInt(limitParam || '25', 10) || 25, 1), 100);
  return { limit, cursor, limitPlusOne: limit + 1 };
}
