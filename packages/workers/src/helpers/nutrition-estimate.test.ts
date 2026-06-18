import { describe, it, expect, vi } from 'vitest';
import { estimateNutrition } from './nutrition-estimate';
import type { RecipeDocument } from '@rr/shared';

function createRecipeDoc(overrides: Partial<RecipeDocument> = {}): RecipeDocument {
  return {
    id: 'r1',
    title: 'Lentil Soup',
    domain: 'example.com',
    source_url: 'https://example.com/recipe',
    ingredients: ['200g lentils', '1 onion', '1L water'],
    instructions: ['Simmer'],
    yields: '4 servings',
    tags: [],
    ...overrides,
  } as RecipeDocument;
}

describe('estimateNutrition', () => {
  it('returns null without calling AI when there are no ingredients', async () => {
    const ai = { run: vi.fn() } as unknown as Ai;
    const result = await estimateNutrition(createRecipeDoc({ ingredients: [] }), ai);
    expect(result).toBeNull();
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('calls a current (non-deprecated) Workers AI model and parses the result', async () => {
    const ai = {
      run: vi.fn(async () => ({
        response: '{"calories":210,"protein_g":12,"fat_g":3,"carbs_g":34,"fiber_g":8,"sodium_mg":120}',
      })),
    } as unknown as Ai;

    const result = await estimateNutrition(createRecipeDoc(), ai);

    expect(ai.run).toHaveBeenCalledWith(
      '@cf/meta/llama-3.1-8b-instruct-fp8',
      expect.objectContaining({ messages: expect.any(Array) }),
    );
    expect(result?.calories).toBe(210);
    expect(result?.source).toBe('ai');
  });
});
