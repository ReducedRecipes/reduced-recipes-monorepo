import { describe, it, expect, vi } from 'vitest';
import { validateCollectionOwnership } from './collection-ownership';

function createMockDB(result: { id: string } | null) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(result),
    })),
  } as unknown as D1Database;
}

describe('validateCollectionOwnership', () => {
  it('returns the collection row when ownership is valid', async () => {
    const db = createMockDB({ id: 'col-1' });
    const result = await validateCollectionOwnership(db, 'col-1', 'user-1');
    expect(result).toEqual({ id: 'col-1' });
    expect(db.prepare).toHaveBeenCalledWith(
      'SELECT id FROM collections WHERE id = ? AND user_id = ?',
    );
  });

  it('returns null when the collection does not exist or is not owned', async () => {
    const db = createMockDB(null);
    const result = await validateCollectionOwnership(db, 'col-999', 'user-1');
    expect(result).toBeNull();
  });
});
