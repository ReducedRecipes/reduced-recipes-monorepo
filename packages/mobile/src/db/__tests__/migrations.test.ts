import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMigrations } from '../migrations';

function createMockDb() {
  return {
    execAsync: vi.fn(),
    getFirstAsync: vi.fn(),
    runAsync: vi.fn(),
  };
}

describe('runMigrations', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  it('creates schema_version table', async () => {
    db.getFirstAsync.mockResolvedValue(null);
    db.execAsync.mockResolvedValue(undefined);
    db.runAsync.mockResolvedValue(undefined);

    await runMigrations(db as any);

    expect(db.execAsync).toHaveBeenCalledTimes(3);
    expect(db.execAsync.mock.calls[0]![0]).toContain('CREATE TABLE IF NOT EXISTS schema_version');
  });

  it('runs both schemas when no prior version exists', async () => {
    db.getFirstAsync.mockResolvedValue(null);
    db.execAsync.mockResolvedValue(undefined);
    db.runAsync.mockResolvedValue(undefined);

    await runMigrations(db as any);

    // First call: create schema_version, second call: SCHEMA, third call: OFFLINE_BOOKMARKS_SCHEMA
    expect(db.execAsync).toHaveBeenCalledTimes(3);
    expect(db.execAsync.mock.calls[1]![0]).toContain('CREATE TABLE IF NOT EXISTS saved_recipes');
    expect(db.execAsync.mock.calls[2]![0]).toContain('CREATE TABLE IF NOT EXISTS offline_bookmarks');
  });

  it('updates version after running migrations', async () => {
    db.getFirstAsync.mockResolvedValue(null);
    db.execAsync.mockResolvedValue(undefined);
    db.runAsync.mockResolvedValue(undefined);

    await runMigrations(db as any);

    expect(db.runAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = db.runAsync.mock.calls[0]!;
    expect(sql).toContain('INSERT INTO schema_version');
    expect(params).toEqual([2]);
  });

  it('skips migration when already at current version', async () => {
    db.getFirstAsync.mockResolvedValue({ version: 2 });
    db.execAsync.mockResolvedValue(undefined);

    await runMigrations(db as any);

    // Only the schema_version table creation, not SCHEMA or OFFLINE_BOOKMARKS_SCHEMA
    expect(db.execAsync).toHaveBeenCalledTimes(1);
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('runs only v2 migration when at version 1', async () => {
    db.getFirstAsync.mockResolvedValue({ version: 1 });
    db.execAsync.mockResolvedValue(undefined);
    db.runAsync.mockResolvedValue(undefined);

    await runMigrations(db as any);

    // schema_version table creation + OFFLINE_BOOKMARKS_SCHEMA only
    expect(db.execAsync).toHaveBeenCalledTimes(2);
    expect(db.execAsync.mock.calls[1]![0]).toContain('CREATE TABLE IF NOT EXISTS offline_bookmarks');
    expect(db.runAsync).toHaveBeenCalledTimes(1);
    const [, params] = db.runAsync.mock.calls[0]!;
    expect(params).toEqual([2]);
  });

  it('is idempotent — running twice has same effect', async () => {
    // First run: no version
    db.getFirstAsync.mockResolvedValueOnce(null);
    db.execAsync.mockResolvedValue(undefined);
    db.runAsync.mockResolvedValue(undefined);
    await runMigrations(db as any);

    // Second run: version already set
    db.getFirstAsync.mockResolvedValueOnce({ version: 2 });
    await runMigrations(db as any);

    // SCHEMA should only run once (second execAsync call from first run)
    const schemaCalls = db.execAsync.mock.calls.filter(
      (call: string[]) => call[0]!.includes('saved_recipes')
    );
    expect(schemaCalls).toHaveLength(1);
  });
});
