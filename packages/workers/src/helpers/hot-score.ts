/**
 * Hot score computation — Reddit-style time-decay ranking.
 *
 * score = log10(max(votes, 1)) + (firstVotedEpoch - EPOCH) / HOT_DECAY_SECONDS
 */

const DEFAULT_EPOCH = 1704067200; // 2024-01-01T00:00:00Z
const DEFAULT_DECAY_SECONDS = 90000; // ~25 hours

/**
 * Recompute and persist hot_score + vote_count for a recipe.
 * Reads from recipe_votes in USERS_DB, writes to recipes in DB.
 */
export async function updateHotScore(
  usersDb: D1Database,
  recipesDb: D1Database,
  recipeId: string,
  decaySeconds = DEFAULT_DECAY_SECONDS,
  epoch = DEFAULT_EPOCH,
): Promise<void> {
  const stats = await usersDb
    .prepare(
      `SELECT COUNT(*) as count, MIN(created_at) as first_voted
       FROM recipe_votes WHERE recipe_id = ?`,
    )
    .bind(recipeId)
    .first<{ count: number; first_voted: string | null }>();

  const votes = stats?.count ?? 0;
  const firstVotedStr = stats?.first_voted ?? null;

  const firstVotedEpoch = firstVotedStr
    ? new Date(firstVotedStr).getTime() / 1000
    : Date.now() / 1000;

  const score = Math.log10(Math.max(votes, 1)) + (firstVotedEpoch - epoch) / decaySeconds;

  await recipesDb
    .prepare(
      `UPDATE recipes
       SET vote_count = ?, hot_score = ?, first_voted_at = ?
       WHERE id = ?`,
    )
    .bind(votes, score, firstVotedStr, recipeId)
    .run();
}

/**
 * Insert or ignore a vote, then refresh hot_score.
 * Returns the new total vote_count.
 */
export async function castVote(
  usersDb: D1Database,
  recipesDb: D1Database,
  userId: string,
  recipeId: string,
  action: string,
  weight: number,
  decaySeconds = DEFAULT_DECAY_SECONDS,
  epoch = DEFAULT_EPOCH,
): Promise<number> {
  await usersDb
    .prepare(
      `INSERT OR IGNORE INTO recipe_votes (user_id, recipe_id, weight, action, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    )
    .bind(userId, recipeId, weight, action)
    .run();

  await updateHotScore(usersDb, recipesDb, recipeId, decaySeconds, epoch);

  const row = await recipesDb
    .prepare('SELECT vote_count FROM recipes WHERE id = ?')
    .bind(recipeId)
    .first<{ vote_count: number }>();

  return row?.vote_count ?? 0;
}
