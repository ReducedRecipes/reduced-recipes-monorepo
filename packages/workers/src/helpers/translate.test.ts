import { describe, it, expect, vi } from 'vitest';
import { translateRecipe } from './translate';
import type { RecipeDocument } from '@rr/shared';

function createMockAi(translations: Record<string, string> = {}) {
  return {
    run: vi.fn(async (_model: string, opts: { text: string; source_lang: string; target_lang: string }) => {
      if (translations[opts.text] !== undefined) {
        return { translated_text: translations[opts.text] };
      }
      return { translated_text: `[translated] ${opts.text}` };
    }),
  } as unknown as Ai;
}

function createRecipeDoc(overrides: Partial<RecipeDocument> = {}): RecipeDocument {
  return {
    url: 'https://example.com/recipe',
    domain: 'example.com',
    title: 'Kartoffelsuppe',
    ingredients: ['Kartoffeln', 'Wasser', 'Salz'],
    instructions: ['Kartoffeln kochen', 'Pürieren'],
    image_url: 'https://example.com/img.jpg',
    total_time: 'PT30M',
    original_language: 'de',
    original_title: null,
    tags: [],
    ...overrides,
  } as RecipeDocument;
}

describe('translateRecipe', () => {
  it('returns doc unchanged when original_language is null', async () => {
    const doc = createRecipeDoc({ original_language: null as any });
    const ai = createMockAi();
    const result = await translateRecipe(doc, ai);
    expect(result).toBe(doc);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('returns doc unchanged when original_language is en', async () => {
    const doc = createRecipeDoc({ original_language: 'en' });
    const ai = createMockAi();
    const result = await translateRecipe(doc, ai);
    expect(result).toBe(doc);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('translates title, ingredients, and instructions', async () => {
    const doc = createRecipeDoc();
    const ai = createMockAi();
    const result = await translateRecipe(doc, ai);

    expect(result.title).toBe('[translated] Kartoffelsuppe');
    expect(result.original_title).toBe('Kartoffelsuppe');
    expect(ai.run).toHaveBeenCalled();
  });

  it('sets original_title to the original title before translation', async () => {
    const doc = createRecipeDoc({ title: 'Soupe à l\'oignon', original_language: 'fr' });
    const ai = createMockAi();
    const result = await translateRecipe(doc, ai);

    expect(result.original_title).toBe('Soupe à l\'oignon');
  });

  it('calls AI with correct source_lang and target_lang', async () => {
    const doc = createRecipeDoc({ original_language: 'fr' });
    const ai = createMockAi();
    await translateRecipe(doc, ai);

    expect(ai.run).toHaveBeenCalledWith('@cf/meta/m2m100-1.2b', expect.objectContaining({
      source_lang: 'fr',
      target_lang: 'en',
    }));
  });

  it('translates ingredients as newline-joined batch', async () => {
    const doc = createRecipeDoc({
      ingredients: ['Mehl', 'Zucker'],
    });
    const ai = createMockAi({
      'Mehl\nZucker': 'Flour\nSugar',
    });
    const result = await translateRecipe(doc, ai);

    expect(result.ingredients).toEqual(['Flour', 'Sugar']);
  });

  it('translates instructions as newline-joined batch', async () => {
    const doc = createRecipeDoc({
      instructions: ['Mischen', 'Backen'],
    });
    const ai = createMockAi({
      'Mischen\nBacken': 'Mix\nBake',
    });
    const result = await translateRecipe(doc, ai);

    expect(result.instructions).toEqual(['Mix', 'Bake']);
  });

  it('falls back to per-item translation when bulk split count mismatches', async () => {
    const doc = createRecipeDoc({
      ingredients: ['Mehl', 'Zucker'],
    });
    // Bulk returns wrong number of lines
    const ai = createMockAi({
      'Mehl\nZucker': 'Flour and Sugar combined',
    });
    const result = await translateRecipe(doc, ai);

    // Falls back to per-item, so each gets [translated] prefix
    expect(result.ingredients).toEqual(['[translated] Mehl', '[translated] Zucker']);
  });

  it('keeps original title on title translation failure', async () => {
    const doc = createRecipeDoc({ title: 'Borscht' });
    const ai = {
      run: vi.fn().mockRejectedValue(new Error('AI error')),
    } as unknown as Ai;

    const result = await translateRecipe(doc, ai);
    expect(result.title).toBe('Borscht');
  });

  it('keeps original ingredients on translation failure', async () => {
    const doc = createRecipeDoc({ ingredients: ['Mehl'] });
    let callCount = 0;
    const ai = {
      run: vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          // title succeeds
          return { translated_text: 'Potato Soup' };
        }
        // ingredients fail
        throw new Error('AI error');
      }),
    } as unknown as Ai;

    const result = await translateRecipe(doc, ai);
    expect(result.ingredients).toEqual(['Mehl']);
  });

  it('keeps original instructions on translation failure', async () => {
    const doc = createRecipeDoc({ instructions: ['Kochen'] });
    let callCount = 0;
    const ai = {
      run: vi.fn(async () => {
        callCount++;
        if (callCount <= 2) {
          // title and ingredients succeed
          return { translated_text: '[ok]' };
        }
        // instructions fail
        throw new Error('AI error');
      }),
    } as unknown as Ai;

    const result = await translateRecipe(doc, ai);
    expect(result.instructions).toEqual(['Kochen']);
  });

  it('handles empty ingredients array', async () => {
    const doc = createRecipeDoc({ ingredients: [] });
    const ai = createMockAi();
    const result = await translateRecipe(doc, ai);
    expect(result.ingredients).toEqual([]);
  });

  it('handles empty instructions array', async () => {
    const doc = createRecipeDoc({ instructions: [] });
    const ai = createMockAi();
    const result = await translateRecipe(doc, ai);
    expect(result.instructions).toEqual([]);
  });

  it('does not mutate the original document', async () => {
    const doc = createRecipeDoc();
    const originalTitle = doc.title;
    const ai = createMockAi();
    const result = await translateRecipe(doc, ai);

    expect(doc.title).toBe(originalTitle);
    expect(result).not.toBe(doc);
  });
});
