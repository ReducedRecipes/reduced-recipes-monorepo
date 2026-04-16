/**
 * User profile, GDPR, and dietary preference routes (Phase 1a).
 *
 * Endpoints:
 *   GET    /api/v1/users/:id                     — public/private profile
 *   PATCH  /api/v1/users/me                      — update profile
 *   DELETE /api/v1/users/me                       — GDPR account deletion
 *   GET    /api/v1/users/me/export                — GDPR data export
 *   GET    /api/v1/users/me/dietary-preferences   — get dietary prefs
 *   PUT    /api/v1/users/me/dietary-preferences   — set dietary prefs
 *   GET    /api/v1/dietary-preferences/recipe-count — preview count
 */

import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import type { User } from '@rr/shared';
import { isValidRestriction, restrictionsToMask } from '@rr/shared/dietary';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { deleteAllSessions } from '../lib/session';

type AuthEnv = { Bindings: Env; Variables: { userId: string; user: User } };

const users = new Hono<AuthEnv>();

// ── GET /api/v1/users/:id — public profile ───────────────────────────
users.get('/api/v1/users/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const usersDB = c.env.USERS_DB;
  if (!usersDB) {
    return c.json({ error: { code: 'SERVER_ERROR', message: 'Users DB not configured' } }, 500);
  }

  const row = await usersDB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }

  const user = row as unknown as User;
  const requesterId = c.get('userId');

  // If profile is private and requester is not the user, return minimal info
  if (user.profile_public === 0 && requesterId !== user.id) {
    return c.json({ id: user.id, name: user.name, picture_url: user.picture_url });
  }

  return c.json({ user });
});

// ── PATCH /api/v1/users/me — update profile ─────────────────────────
users.patch('/api/v1/users/me', requireAuth, async (c) => {
  const usersDB = c.env.USERS_DB;
  const sessionKV = c.env.SESSION_KV;
  if (!usersDB) {
    return c.json({ error: { code: 'SERVER_ERROR', message: 'Users DB not configured' } }, 500);
  }

  const userId = c.get('userId');
  const body = await c.req.json<{ name?: string; profile_public?: boolean }>();

  // Validate
  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100)) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'Name must be 1-100 characters' } }, 400);
  }
  if (body.profile_public !== undefined && typeof body.profile_public !== 'boolean') {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'profile_public must be a boolean' } }, 400);
  }

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (body.name !== undefined) {
    updates.push('name = ?');
    params.push(body.name);
  }
  if (body.profile_public !== undefined) {
    updates.push('profile_public = ?');
    params.push(body.profile_public ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'No fields to update' } }, 400);
  }

  updates.push("updated_at = datetime('now')");
  params.push(userId);

  await usersDB
    .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  // Fetch updated user
  const row = await usersDB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  const user = row as unknown as User;

  return c.json({ user });
});

// ── DELETE /api/v1/users/me — GDPR account deletion ─────────────────
users.delete('/api/v1/users/me', requireAuth, async (c) => {
  const usersDB = c.env.USERS_DB;
  const sessionKV = c.env.SESSION_KV;
  const userCacheKV = c.env.USER_CACHE_KV;
  if (!usersDB || !sessionKV) {
    return c.json({ error: { code: 'SERVER_ERROR', message: 'Auth not configured' } }, 500);
  }

  const userId = c.get('userId');

  // Delete user row — ON DELETE CASCADE handles all child tables
  await usersDB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

  // Delete all sessions from KV
  await deleteAllSessions(sessionKV, userId);

  // Invalidate dietary cache
  if (userCacheKV) {
    await userCacheKV.delete(`user-dietary:${userId}`);
  }

  return c.json({ ok: true });
});

// ── GET /api/v1/users/me/export — GDPR data export ──────────────────
users.get('/api/v1/users/me/export', requireAuth, async (c) => {
  const usersDB = c.env.USERS_DB;
  if (!usersDB) {
    return c.json({ error: { code: 'SERVER_ERROR', message: 'Users DB not configured' } }, 500);
  }

  const userId = c.get('userId');

  const batchResults = await usersDB.batch([
    usersDB.prepare('SELECT * FROM users WHERE id = ?').bind(userId),
    usersDB.prepare('SELECT * FROM user_auth_providers WHERE user_id = ?').bind(userId),
    usersDB.prepare('SELECT * FROM user_dietary_preferences WHERE user_id = ?').bind(userId),
    usersDB.prepare('SELECT * FROM collections WHERE user_id = ?').bind(userId),
    usersDB.prepare('SELECT * FROM bookmarks WHERE user_id = ?').bind(userId),
    usersDB.prepare('SELECT * FROM recipe_views WHERE user_id = ?').bind(userId),
    usersDB.prepare('SELECT * FROM notifications WHERE user_id = ?').bind(userId),
    usersDB.prepare('SELECT * FROM consent_records WHERE user_id = ?').bind(userId),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    profile: batchResults[0]?.results?.[0] ?? null,
    auth_providers: batchResults[1]?.results ?? [],
    dietary_preferences: batchResults[2]?.results ?? [],
    collections: batchResults[3]?.results ?? [],
    bookmarks: batchResults[4]?.results ?? [],
    recipe_views: batchResults[5]?.results ?? [],
    notifications: batchResults[6]?.results ?? [],
    consent_records: batchResults[7]?.results ?? [],
  };

  return c.json(exportData, 200, {
    'Content-Disposition': `attachment; filename="user-data-export-${userId}.json"`,
  });
});

// ── GET /api/v1/users/me/dietary-preferences ─────────────────────────
users.get('/api/v1/users/me/dietary-preferences', requireAuth, async (c) => {
  const usersDB = c.env.USERS_DB;
  if (!usersDB) {
    return c.json({ error: { code: 'SERVER_ERROR', message: 'Users DB not configured' } }, 500);
  }

  const userId = c.get('userId');
  const result = await usersDB
    .prepare('SELECT restriction FROM user_dietary_preferences WHERE user_id = ?')
    .bind(userId)
    .all();

  const restrictions = (result.results ?? []).map(
    (r) => (r as Record<string, unknown>).restriction as string,
  );

  return c.json({ restrictions });
});

// ── PUT /api/v1/users/me/dietary-preferences ─────────────────────────
users.put('/api/v1/users/me/dietary-preferences', requireAuth, async (c) => {
  const usersDB = c.env.USERS_DB;
  const recipesDB = c.env.DB;
  const userCacheKV = c.env.USER_CACHE_KV;
  if (!usersDB) {
    return c.json({ error: { code: 'SERVER_ERROR', message: 'Users DB not configured' } }, 500);
  }

  const userId = c.get('userId');
  const body = await c.req.json<{ restrictions: string[] }>();

  if (!Array.isArray(body.restrictions)) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'restrictions must be an array' } }, 400);
  }

  // Validate each restriction name
  for (const r of body.restrictions) {
    if (!isValidRestriction(r)) {
      return c.json(
        { error: { code: 'INVALID_INPUT', message: `Invalid restriction: ${r}` } },
        400,
      );
    }
  }

  // Delete existing and insert new in a batch
  const stmts: D1PreparedStatement[] = [
    usersDB.prepare('DELETE FROM user_dietary_preferences WHERE user_id = ?').bind(userId),
  ];

  for (const restriction of body.restrictions) {
    stmts.push(
      usersDB
        .prepare('INSERT INTO user_dietary_preferences (user_id, restriction) VALUES (?, ?)')
        .bind(userId, restriction),
    );
  }

  await usersDB.batch(stmts);

  // Invalidate KV cache
  if (userCacheKV) {
    await userCacheKV.delete(`user-dietary:${userId}`);
  }

  // Compute matching recipe count if recipes DB is available
  let matching_recipe_count: number | null = null;
  if (recipesDB && body.restrictions.length > 0) {
    const mask = restrictionsToMask(body.restrictions);
    const countResult = await recipesDB
      .prepare('SELECT COUNT(*) as count FROM recipes WHERE (dietary_bitmask & ?) = ?')
      .bind(mask, mask)
      .first();
    matching_recipe_count = countResult ? (countResult as Record<string, unknown>).count as number : 0;
  } else if (recipesDB) {
    const countResult = await recipesDB
      .prepare('SELECT COUNT(*) as count FROM recipes')
      .first();
    matching_recipe_count = countResult ? (countResult as Record<string, unknown>).count as number : 0;
  }

  return c.json({
    restrictions: body.restrictions,
    matching_recipe_count,
    updated_at: new Date().toISOString(),
  });
});

// ── GET /api/v1/dietary-preferences/recipe-count — preview (no auth) ─
users.get('/api/v1/dietary-preferences/recipe-count', async (c) => {
  const recipesDB = c.env.DB;

  const restrictionsParam = c.req.query('restrictions') ?? '';
  const restrictions = restrictionsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const r of restrictions) {
    if (!isValidRestriction(r)) {
      return c.json(
        { error: { code: 'INVALID_INPUT', message: `Invalid restriction: ${r}` } },
        400,
      );
    }
  }

  let count = 0;
  if (restrictions.length > 0) {
    const mask = restrictionsToMask(restrictions);
    const result = await recipesDB
      .prepare('SELECT COUNT(*) as count FROM recipes WHERE (dietary_bitmask & ?) = ?')
      .bind(mask, mask)
      .first();
    count = result ? (result as Record<string, unknown>).count as number : 0;
  } else {
    const result = await recipesDB.prepare('SELECT COUNT(*) as count FROM recipes').first();
    count = result ? (result as Record<string, unknown>).count as number : 0;
  }

  return c.json({ count });
});

export default users;
