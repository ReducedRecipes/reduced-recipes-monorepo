/**
 * Shared cursor-based pagination helper.
 *
 * Encapsulates the limit+1 fetch, overflow detection, and next_cursor
 * extraction that was previously duplicated across multiple route files.
 */

export interface CursorPaginateOptions {
  /** D1 database instance to query. */
  db: D1Database;
  /** Full SQL query ending with ORDER BY clause (no LIMIT). */
  query: string;
  /** Bind parameters for the query. */
  params: (string | number)[];
  /** Column name to extract the next cursor value from. */
  cursorColumn: string;
  /** Number of items per page (already parsed). */
  limit: number;
}

export interface CursorPaginatedResult<T> {
  items: T[];
  next_cursor: string | null;
}

/**
 * Execute a cursor-paginated D1 query.
 *
 * Fetches `limit + 1` rows, pops the overflow row if present, and extracts
 * the `next_cursor` value from the last returned item.
 */
export async function cursorPaginate<T = Record<string, unknown>>(
  options: CursorPaginateOptions,
): Promise<CursorPaginatedResult<T>> {
  const { db, query, params, cursorColumn, limit } = options;

  const result = await db
    .prepare(`${query} LIMIT ?`)
    .bind(...params, limit + 1)
    .all();

  const rows = (result.results ?? []) as unknown as T[];

  let next_cursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    const last = rows[rows.length - 1];
    if (last) {
      next_cursor = (last as Record<string, unknown>)[cursorColumn] as string;
    }
  }

  return { items: rows, next_cursor };
}

/**
 * Parse a limit query parameter with bounds clamping.
 *
 * @param limitParam  Raw query-string value (may be undefined).
 * @param defaultLimit  Fallback when the param is missing or NaN (default 25).
 * @param maxLimit  Upper bound (default 100).
 */
export function parseLimit(
  limitParam: string | undefined,
  defaultLimit = 25,
  maxLimit = 100,
): number {
  return Math.min(
    Math.max(parseInt(limitParam || String(defaultLimit), 10) || defaultLimit, 1),
    maxLimit,
  );
}
