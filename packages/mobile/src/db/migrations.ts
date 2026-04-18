import type { SQLiteDatabase } from 'expo-sqlite';
import { SCHEMA, OFFLINE_BOOKMARKS_SCHEMA } from './schema';

const CURRENT_VERSION = 2;

/**
 * Run migrations idempotently. Tracks schema version in a meta table
 * so migrations only run once per version bump.
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  // Create version tracking table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    );
  `);

  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_version WHERE id = 1'
  );
  const currentVersion = row?.version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync(SCHEMA);
  }

  if (currentVersion < 2) {
    await db.execAsync(OFFLINE_BOOKMARKS_SCHEMA);
  }

  if (currentVersion < CURRENT_VERSION) {
    await db.runAsync(
      `INSERT INTO schema_version (id, version) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET version = excluded.version`,
      [CURRENT_VERSION]
    );
  }
}
