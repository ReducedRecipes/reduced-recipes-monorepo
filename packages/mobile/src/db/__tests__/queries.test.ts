import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecipeDocument } from '@rr/shared';
import {
  getSavedRecipe,
  getAllSaved,
  upsertRecipe,
  deleteRecipe,
  searchSaved,
} from '../queries';

// Mock expo-sqlite database
function createMockDb() {
  return {
    getFirstAsync: vi.fn(),
    getAllAsync: vi.fn(),
    runAsync: vi.fn(),
    execAsync: vi.fn(),
  };
}

const sampleRecipe: RecipeDocument = {
  id: 'recipe-1',
  source_url: 'https://example.com/recipe',
  domain: 'example.com',
  title: 'Test Recipe',
  image_url: 'https://example.com/img.jpg',
  author: 'Chef Test',
  yields: '4 servings',
  prep_time: 10,
  cook_time: 20,
  total_time: 30,
  ingredients: ['1 cup flour', '2 eggs'],
  instructions: ['Mix ingredients', 'Bake at 350F'],
  tags: ['baking', 'easy'],
  cuisine: 'American',
  category: 'Dessert',
  keywords: ['cake', 'simple'],
  schema_valid: true,
  extracted_at: '2024-01-01T00:00:00Z',
  last_checked: '2024-01-02T00:00:00Z',
};

const sampleRow = {
  id: 'recipe-1',
  source_url: 'https://example.com/recipe',
  domain: 'example.com',
  title: 'Test Recipe',
  image_url: 'https://example.com/img.jpg',
  author: 'Chef Test',
  yields: '4 servings',
  prep_time: 10,
  cook_time: 20,
  total_time: 30,
  ingredients: '["1 cup flour","2 eggs"]',
  instructions: '["Mix ingredients","Bake at 350F"]',
  tags: '["baking","easy"]',
  cuisine: 'American',
  category: 'Dessert',
  keywords: '["cake","simple"]',
  schema_valid: 1,
  extracted_at: '2024-01-01T00:00:00Z',
  last_checked: '2024-01-02T00:00:00Z',
  saved_at: '2024-01-03T00:00:00Z',
};

describe('queries', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('getSavedRecipe', () => {
    it('returns deserialized recipe when found', async () => {
      db.getFirstAsync.mockResolvedValue(sampleRow);

      const result = await getSavedRecipe(db as any, 'recipe-1');

      expect(db.getFirstAsync).toHaveBeenCalledWith(
        'SELECT * FROM saved_recipes WHERE id = ?',
        ['recipe-1']
      );
      expect(result).not.toBeNull();
      expect(result!.id).toBe('recipe-1');
      expect(result!.ingredients).toEqual(['1 cup flour', '2 eggs']);
      expect(result!.tags).toEqual(['baking', 'easy']);
      expect(result!.schema_valid).toBe(true);
      expect(result!.saved_at).toBe('2024-01-03T00:00:00Z');
    });

    it('returns null when not found', async () => {
      db.getFirstAsync.mockResolvedValue(null);

      const result = await getSavedRecipe(db as any, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getAllSaved', () => {
    it('returns all saved recipes ordered by saved_at DESC', async () => {
      db.getAllAsync.mockResolvedValue([sampleRow]);

      const results = await getAllSaved(db as any);

      expect(db.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM saved_recipes ORDER BY saved_at DESC'
      );
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe('Test Recipe');
      expect(results[0]!.instructions).toEqual(['Mix ingredients', 'Bake at 350F']);
    });

    it('returns empty array when no saved recipes', async () => {
      db.getAllAsync.mockResolvedValue([]);

      const results = await getAllSaved(db as any);
      expect(results).toEqual([]);
    });
  });

  describe('upsertRecipe', () => {
    it('calls runAsync with parameterized INSERT ON CONFLICT', async () => {
      db.runAsync.mockResolvedValue(undefined);

      await upsertRecipe(db as any, sampleRecipe);

      expect(db.runAsync).toHaveBeenCalledTimes(1);
      const [sql, params] = db.runAsync.mock.calls[0]!;
      expect(sql).toContain('INSERT INTO saved_recipes');
      expect(sql).toContain('ON CONFLICT(id) DO UPDATE');
      // Verify parameterized values — no string interpolation
      expect(params).toContain('recipe-1');
      expect(params).toContain('Test Recipe');
      expect(params).toContain('["1 cup flour","2 eggs"]');
      expect(params).toContain('["baking","easy"]');
      // schema_valid should be stored as 1 (integer)
      expect(params).toContain(1);
    });
  });

  describe('deleteRecipe', () => {
    it('deletes by ID with parameterized query', async () => {
      db.runAsync.mockResolvedValue(undefined);

      await deleteRecipe(db as any, 'recipe-1');

      expect(db.runAsync).toHaveBeenCalledWith(
        'DELETE FROM saved_recipes WHERE id = ?',
        ['recipe-1']
      );
    });
  });

  describe('searchSaved', () => {
    it('searches title, ingredients, and tags with LIKE', async () => {
      db.getAllAsync.mockResolvedValue([sampleRow]);

      const results = await searchSaved(db as any, 'flour');

      expect(db.getAllAsync).toHaveBeenCalledTimes(1);
      const [sql, params] = db.getAllAsync.mock.calls[0]!;
      expect(sql).toContain('WHERE title LIKE ?');
      expect(sql).toContain('OR ingredients LIKE ?');
      expect(sql).toContain('OR tags LIKE ?');
      expect(params).toEqual(['%flour%', '%flour%', '%flour%']);
      expect(results).toHaveLength(1);
      expect(results[0]!.ingredients).toEqual(['1 cup flour', '2 eggs']);
    });

    it('returns empty array for no matches', async () => {
      db.getAllAsync.mockResolvedValue([]);

      const results = await searchSaved(db as any, 'nonexistent');
      expect(results).toEqual([]);
    });
  });
});
