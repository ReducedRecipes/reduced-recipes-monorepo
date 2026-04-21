import { describe, it, expect, vi } from 'vitest';
import { buildEmbeddingText, embedRecipe } from './embed';
import type { RecipeDocument } from '@rr/shared';

function makeDoc(overrides: Partial<RecipeDocument> = {}): RecipeDocument {
  return {
    id: 'recipe-1',
    source_url: 'https://example.com/recipe/1',
    domain: 'example.com',
    title: 'Spaghetti Carbonara',
    image_url: null,
    author: null,
    yields: null,
    prep_time: null,
    cook_time: null,
    total_time: 30,
    ingredients: ['spaghetti', 'guanciale', 'eggs', 'pecorino romano', 'black pepper'],
    instructions: ['Boil pasta', 'Fry guanciale', 'Mix eggs and cheese', 'Combine'],
    tags: ['italian', 'pasta'],
    cuisine: 'Italian',
    category: 'Pasta',
    keywords: [],
    schema_valid: true,
    extracted_at: '2024-06-01T00:00:00Z',
    last_checked: '2024-06-01T00:00:00Z',
    ...overrides,
  };
}

describe('buildEmbeddingText', () => {
  it('builds pipe-delimited text from title, cuisine, category, and ingredients', () => {
    const doc = makeDoc();
    const text = buildEmbeddingText(doc);
    expect(text).toBe(
      'Spaghetti Carbonara | Italian | Pasta | spaghetti, guanciale, eggs, pecorino romano, black pepper',
    );
  });

  it('uses empty string for null cuisine', () => {
    const doc = makeDoc({ cuisine: null });
    const text = buildEmbeddingText(doc);
    expect(text).toBe(
      'Spaghetti Carbonara |  | Pasta | spaghetti, guanciale, eggs, pecorino romano, black pepper',
    );
  });

  it('uses empty string for null category', () => {
    const doc = makeDoc({ category: null });
    const text = buildEmbeddingText(doc);
    expect(text).toBe(
      'Spaghetti Carbonara | Italian |  | spaghetti, guanciale, eggs, pecorino romano, black pepper',
    );
  });

  it('handles empty ingredients list', () => {
    const doc = makeDoc({ ingredients: [] });
    const text = buildEmbeddingText(doc);
    expect(text).toBe('Spaghetti Carbonara | Italian | Pasta | ');
  });

  it('joins multiple ingredients with comma-space', () => {
    const doc = makeDoc({ ingredients: ['flour', 'sugar', 'butter'] });
    const text = buildEmbeddingText(doc);
    expect(text).toContain('flour, sugar, butter');
  });
});

describe('embedRecipe', () => {
  it('calls AI with the embedding model and returns the first vector', async () => {
    const mockVector = Array.from({ length: 768 }, (_, i) => i / 768);
    const mockAi = {
      run: vi.fn().mockResolvedValue({ data: [mockVector] }),
    } as unknown as Ai;

    const doc = makeDoc();
    const result = await embedRecipe(doc, mockAi);

    expect(mockAi.run).toHaveBeenCalledWith('@cf/google/embeddinggemma-300m', {
      text: [buildEmbeddingText(doc)],
    });
    expect(result).toEqual(mockVector);
    expect(result).toHaveLength(768);
  });

  it('returns null when AI returns no data', async () => {
    const mockAi = {
      run: vi.fn().mockResolvedValue({}),
    } as unknown as Ai;

    const result = await embedRecipe(makeDoc(), mockAi);
    expect(result).toBeNull();
  });

  it('returns null when AI returns empty data array', async () => {
    const mockAi = {
      run: vi.fn().mockResolvedValue({ data: [] }),
    } as unknown as Ai;

    const result = await embedRecipe(makeDoc(), mockAi);
    expect(result).toBeNull();
  });

  it('returns null when AI returns empty vector', async () => {
    const mockAi = {
      run: vi.fn().mockResolvedValue({ data: [[]] }),
    } as unknown as Ai;

    const result = await embedRecipe(makeDoc(), mockAi);
    expect(result).toBeNull();
  });

  it('propagates errors thrown by AI', async () => {
    const mockAi = {
      run: vi.fn().mockRejectedValue(new Error('AI unavailable')),
    } as unknown as Ai;

    await expect(embedRecipe(makeDoc(), mockAi)).rejects.toThrow('AI unavailable');
  });
});
