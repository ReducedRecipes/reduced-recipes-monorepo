/**
 * Dietary bitmask filtering helpers for recipe endpoints.
 *
 * Resolves dietary mask from authenticated user prefs (cached in USER_CACHE_KV)
 * or from the X-Dietary-Prefs header for anonymous users.
 */

import type { Env } from '@rr/shared';
import { restrictionsToMask, isValidRestriction } from '@rr/shared/dietary';

const CACHE_TTL = 3600; // 1 hour

/** Minimal context shape needed by dietary filter helpers. */
interface AppContext {
  get(key: 'userId'): string | undefined;
  req: { header(name: string): string | undefined };
  env: Env;
}

/**
 * Get the dietary bitmask for the current request.
 * - Authenticated: look up user prefs in USERS_DB, cache in USER_CACHE_KV.
 * - Anonymous: parse X-Dietary-Prefs header (comma-separated restriction names).
 * - Returns 0 if no preferences set.
 */
export async function getDietaryMask(c: AppContext): Promise<number> {
  const userId = c.get('userId');

  if (userId) {
    return getUserDietaryMask(c, userId);
  }

  // Anonymous: check X-Dietary-Prefs header
  const header = c.req.header('X-Dietary-Prefs');
  if (!header) return 0;

  const names = header.split(',').map((s) => s.trim()).filter(Boolean);
  const valid = names.filter(isValidRestriction);
  if (valid.length === 0) return 0;

  return restrictionsToMask(valid);
}

async function getUserDietaryMask(c: AppContext, userId: string): Promise<number> {
  const cacheKV = c.env.USER_CACHE_KV;
  const cacheKey = `user-dietary:${userId}`;

  // Check cache first
  if (cacheKV) {
    const cached = await cacheKV.get(cacheKey, 'text');
    if (cached !== null) return parseInt(cached, 10);
  }

  // Query USERS_DB
  const usersDB = c.env.USERS_DB;
  if (!usersDB) return 0;

  const { results } = await usersDB
    .prepare('SELECT restriction_name FROM user_dietary_preferences WHERE user_id = ?')
    .bind(userId)
    .all();

  const restrictions = (results ?? []).map((r) => (r as { restriction_name: string }).restriction_name);
  const mask = restrictionsToMask(restrictions);

  // Cache the computed mask
  if (cacheKV) {
    await cacheKV.put(cacheKey, String(mask), { expirationTtl: CACHE_TTL });
  }

  return mask;
}

/**
 * Append dietary bitmask WHERE clause to conditions array and params.
 * Only adds the filter if mask > 0.
 */
export function applyDietaryFilter(
  conditions: string[],
  params: (string | number)[],
  mask: number,
): void {
  if (mask > 0) {
    conditions.push('(r.dietary_bitmask & ? ) = ?');
    params.push(mask, mask);
  }
}
