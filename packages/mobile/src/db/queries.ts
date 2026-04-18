import type { SQLiteDatabase } from 'expo-sqlite';
import type { RecipeDocument } from '@rr/shared';

export interface SavedRecipe extends RecipeDocument {
  saved_at: string;
}

/**
 * Get a single saved recipe by ID.
 */
export async function getSavedRecipe(
  db: SQLiteDatabase,
  id: string
): Promise<SavedRecipe | null> {
  const row = await db.getFirstAsync<SavedRecipeRow>(
    'SELECT * FROM saved_recipes WHERE id = ?',
    [id]
  );
  return row ? deserializeRow(row) : null;
}

/**
 * Get all saved recipes, ordered by most recently saved.
 */
export async function getAllSaved(db: SQLiteDatabase): Promise<SavedRecipe[]> {
  const rows = await db.getAllAsync<SavedRecipeRow>(
    'SELECT * FROM saved_recipes ORDER BY saved_at DESC'
  );
  return rows.map(deserializeRow);
}

/**
 * Insert or update a saved recipe.
 */
export async function upsertRecipe(
  db: SQLiteDatabase,
  recipe: RecipeDocument
): Promise<void> {
  await db.runAsync(
    `INSERT INTO saved_recipes (
      id, source_url, domain, title, image_url, author, yields,
      prep_time, cook_time, total_time, ingredients, instructions,
      tags, cuisine, category, keywords, schema_valid,
      extracted_at, last_checked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_url = excluded.source_url,
      domain = excluded.domain,
      title = excluded.title,
      image_url = excluded.image_url,
      author = excluded.author,
      yields = excluded.yields,
      prep_time = excluded.prep_time,
      cook_time = excluded.cook_time,
      total_time = excluded.total_time,
      ingredients = excluded.ingredients,
      instructions = excluded.instructions,
      tags = excluded.tags,
      cuisine = excluded.cuisine,
      category = excluded.category,
      keywords = excluded.keywords,
      schema_valid = excluded.schema_valid,
      extracted_at = excluded.extracted_at,
      last_checked = excluded.last_checked`,
    [
      recipe.id,
      recipe.source_url,
      recipe.domain,
      recipe.title,
      recipe.image_url,
      recipe.author,
      recipe.yields,
      recipe.prep_time,
      recipe.cook_time,
      recipe.total_time,
      JSON.stringify(recipe.ingredients),
      JSON.stringify(recipe.instructions),
      JSON.stringify(recipe.tags),
      recipe.cuisine,
      recipe.category,
      JSON.stringify(recipe.keywords),
      recipe.schema_valid ? 1 : 0,
      recipe.extracted_at,
      recipe.last_checked,
    ]
  );
}

/**
 * Delete a saved recipe by ID.
 */
export async function deleteRecipe(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  await db.runAsync('DELETE FROM saved_recipes WHERE id = ?', [id]);
}

/**
 * Search saved recipes by title, ingredients, or tags.
 */
export async function searchSaved(
  db: SQLiteDatabase,
  query: string
): Promise<SavedRecipe[]> {
  const pattern = `%${query}%`;
  const rows = await db.getAllAsync<SavedRecipeRow>(
    `SELECT * FROM saved_recipes
     WHERE title LIKE ?
        OR ingredients LIKE ?
        OR tags LIKE ?
     ORDER BY saved_at DESC`,
    [pattern, pattern, pattern]
  );
  return rows.map(deserializeRow);
}

// --- Offline bookmark actions ---

export interface OfflineBookmarkAction {
  id: string;
  recipe_id: string;
  collection_id: string | null;
  action: 'add' | 'remove';
  client_timestamp: string;
  synced: boolean;
}

export async function insertOfflineAction(
  db: SQLiteDatabase,
  action: Omit<OfflineBookmarkAction, 'id' | 'synced'>
): Promise<void> {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await db.runAsync(
    `INSERT INTO offline_bookmarks (id, recipe_id, collection_id, action, client_timestamp, synced)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [id, action.recipe_id, action.collection_id, action.action, action.client_timestamp]
  );
}

export async function getPendingActions(
  db: SQLiteDatabase
): Promise<OfflineBookmarkAction[]> {
  const rows = await db.getAllAsync<OfflineBookmarkRow>(
    'SELECT * FROM offline_bookmarks WHERE synced = 0 ORDER BY client_timestamp ASC'
  );
  return rows.map(deserializeOfflineRow);
}

export async function markActionSynced(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  await db.runAsync(
    'UPDATE offline_bookmarks SET synced = 1 WHERE id = ?',
    [id]
  );
}

export async function clearSyncedActions(
  db: SQLiteDatabase
): Promise<void> {
  await db.runAsync('DELETE FROM offline_bookmarks WHERE synced = 1');
}

interface OfflineBookmarkRow {
  id: string;
  recipe_id: string;
  collection_id: string | null;
  action: string;
  client_timestamp: string;
  synced: number;
}

function deserializeOfflineRow(row: OfflineBookmarkRow): OfflineBookmarkAction {
  return {
    ...row,
    action: row.action as 'add' | 'remove',
    synced: row.synced === 1,
  };
}

// --- Internal helpers ---

interface SavedRecipeRow {
  id: string;
  source_url: string;
  domain: string;
  title: string;
  image_url: string | null;
  author: string | null;
  yields: string | null;
  prep_time: number | null;
  cook_time: number | null;
  total_time: number | null;
  ingredients: string;
  instructions: string;
  tags: string;
  cuisine: string | null;
  category: string | null;
  keywords: string;
  schema_valid: number;
  extracted_at: string;
  last_checked: string;
  saved_at: string;
}

function deserializeRow(row: SavedRecipeRow): SavedRecipe {
  return {
    ...row,
    ingredients: JSON.parse(row.ingredients),
    instructions: JSON.parse(row.instructions),
    tags: JSON.parse(row.tags),
    keywords: JSON.parse(row.keywords),
    schema_valid: row.schema_valid === 1,
  };
}
