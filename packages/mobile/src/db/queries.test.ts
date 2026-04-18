import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  insertOfflineAction,
  getPendingActions,
  markActionSynced,
  clearSyncedActions,
} from './queries';

function createMockDb() {
  const rows: Record<string, unknown[]> = {};
  const db = {
    runAsync: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO offline_bookmarks')) {
        const p = params as unknown[];
        rows['offline_bookmarks'] = rows['offline_bookmarks'] || [];
        rows['offline_bookmarks'].push({
          id: p[0],
          recipe_id: p[1],
          collection_id: p[2],
          action: p[3],
          client_timestamp: p[4],
          synced: 0,
        });
      }
      if (sql.includes('UPDATE offline_bookmarks SET synced = 1')) {
        const id = (params as unknown[])[0];
        const list = rows['offline_bookmarks'] || [];
        for (const row of list) {
          if ((row as { id: string }).id === id) {
            (row as { synced: number }).synced = 1;
          }
        }
      }
      if (sql.includes('DELETE FROM offline_bookmarks WHERE synced = 1')) {
        rows['offline_bookmarks'] = (rows['offline_bookmarks'] || []).filter(
          (r) => (r as { synced: number }).synced !== 1
        );
      }
    }),
    getAllAsync: vi.fn(async () => {
      return (rows['offline_bookmarks'] || []).filter(
        (r) => (r as { synced: number }).synced === 0
      );
    }),
    getFirstAsync: vi.fn(),
    execAsync: vi.fn(),
  } as unknown as SQLiteDatabase;

  return { db, rows };
}

describe('Offline bookmark queries', () => {
  let db: SQLiteDatabase;
  let rows: Record<string, unknown[]>;

  beforeEach(() => {
    const mock = createMockDb();
    db = mock.db;
    rows = mock.rows;
  });

  it('insertOfflineAction inserts a pending action', async () => {
    await insertOfflineAction(db, {
      recipe_id: 'recipe-1',
      collection_id: 'col-1',
      action: 'add',
      client_timestamp: '2026-01-01T00:00:00Z',
    });

    expect(db.runAsync).toHaveBeenCalledOnce();
    expect(rows['offline_bookmarks']).toHaveLength(1);
    const inserted = rows['offline_bookmarks']![0] as {
      recipe_id: string;
      collection_id: string;
      action: string;
      synced: number;
    };
    expect(inserted.recipe_id).toBe('recipe-1');
    expect(inserted.collection_id).toBe('col-1');
    expect(inserted.action).toBe('add');
    expect(inserted.synced).toBe(0);
  });

  it('insertOfflineAction supports null collection_id', async () => {
    await insertOfflineAction(db, {
      recipe_id: 'recipe-2',
      collection_id: null,
      action: 'remove',
      client_timestamp: '2026-01-01T00:00:00Z',
    });

    const inserted = rows['offline_bookmarks']![0] as {
      collection_id: string | null;
      action: string;
    };
    expect(inserted.collection_id).toBeNull();
    expect(inserted.action).toBe('remove');
  });

  it('getPendingActions returns only unsynced actions', async () => {
    await insertOfflineAction(db, {
      recipe_id: 'recipe-1',
      collection_id: null,
      action: 'add',
      client_timestamp: '2026-01-01T00:00:00Z',
    });
    await insertOfflineAction(db, {
      recipe_id: 'recipe-2',
      collection_id: 'col-1',
      action: 'remove',
      client_timestamp: '2026-01-01T00:01:00Z',
    });

    const pending = await getPendingActions(db);
    expect(pending).toHaveLength(2);
    expect(pending[0]!.recipe_id).toBe('recipe-1');
    expect(pending[0]!.synced).toBe(false);
    expect(pending[1]!.recipe_id).toBe('recipe-2');
    expect(pending[1]!.synced).toBe(false);
  });

  it('markActionSynced marks a specific action as synced', async () => {
    await insertOfflineAction(db, {
      recipe_id: 'recipe-1',
      collection_id: null,
      action: 'add',
      client_timestamp: '2026-01-01T00:00:00Z',
    });

    const actionId = (rows['offline_bookmarks']![0] as { id: string }).id;
    await markActionSynced(db, actionId);

    expect(
      (rows['offline_bookmarks']![0] as { synced: number }).synced
    ).toBe(1);
  });

  it('clearSyncedActions removes only synced actions', async () => {
    await insertOfflineAction(db, {
      recipe_id: 'recipe-1',
      collection_id: null,
      action: 'add',
      client_timestamp: '2026-01-01T00:00:00Z',
    });
    await insertOfflineAction(db, {
      recipe_id: 'recipe-2',
      collection_id: null,
      action: 'remove',
      client_timestamp: '2026-01-01T00:01:00Z',
    });

    // Mark first as synced
    const actionId = (rows['offline_bookmarks']![0] as { id: string }).id;
    await markActionSynced(db, actionId);

    // Clear synced
    await clearSyncedActions(db);

    expect(rows['offline_bookmarks']).toHaveLength(1);
    expect(
      (rows['offline_bookmarks']![0] as { recipe_id: string }).recipe_id
    ).toBe('recipe-2');
  });
});
