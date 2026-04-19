/**
 * Parse a limit query parameter with bounds clamping.
 * Defaults to 25, min 1, max 100.
 */
export function parseLimit(limitParam: string | undefined, defaultLimit = 25): number {
  return Math.min(Math.max(parseInt(limitParam || String(defaultLimit), 10) || defaultLimit, 1), 100);
}

/**
 * Extract cursor-based pagination from a rows array.
 * Expects rows fetched with LIMIT = limit + 1.
 * Mutates the input array (pops the extra row if present).
 */
export function paginateRows<T>(
  rows: T[],
  limit: number,
  cursorField: keyof T,
): { items: T[]; next_cursor: string | null } {
  let next_cursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    const lastRow = rows[rows.length - 1];
    next_cursor = lastRow ? String(lastRow[cursorField]) : null;
  }
  return { items: rows, next_cursor };
}
