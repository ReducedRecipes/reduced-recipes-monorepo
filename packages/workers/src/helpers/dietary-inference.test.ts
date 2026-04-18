import { describe, it, expect, vi } from 'vitest';
import {
  inferDietaryBitmask,
  ruleBasedScan,
  parseAiResponse,
} from './dietary-inference';
import { DIETARY_FLAGS } from '@rr/shared/dietary';
import type { RecipeDocument } from '@rr/shared';

// ── Helpers ─────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<RecipeDocument> = {}): RecipeDocument {
  return {
    id: 'test-id',
    source_url: 'https://example.com/recipe',
    domain: 'example.com',
    title: 'Test Recipe',
    image_url: null,
    author: null,
    yields: null,
    prep_time: null,
    cook_time: null,
    total_time: null,
    ingredients: [],
    instructions: [],
    tags: [],
    cuisine: null,
    category: null,
    keywords: [],
    schema_valid: true,
    extracted_at: '2024-01-01T00:00:00Z',
    last_checked: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAi(response?: string, shouldThrow = false) {
  return {
    run: vi.fn().mockImplementation(() => {
      if (shouldThrow) throw new Error('AI service unavailable');
      return Promise.resolve({ response });
    }),
  } as unknown as Ai;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('inferDietaryBitmask', () => {
  it('detects a pure vegan recipe by rule-based scan', async () => {
    const doc = makeDoc({
      title: 'Vegan Buddha Bowl',
      ingredients: ['quinoa', 'chickpeas', 'avocado', 'tahini'],
      keywords: ['vegan', 'healthy'],
    });
    const ai = makeAi('[]');

    const mask = await inferDietaryBitmask(doc, ai);

    // "vegan" keyword -> vegan + vegetarian + dairy-free + egg-free
    expect(mask & DIETARY_FLAGS.vegan).toBeTruthy();
    expect(mask & DIETARY_FLAGS.vegetarian).toBeTruthy();
    expect(mask & DIETARY_FLAGS['dairy-free']).toBeTruthy();
    expect(mask & DIETARY_FLAGS['egg-free']).toBeTruthy();
  });

  it('triggers AI fallback for ambiguous recipe and merges results', async () => {
    const doc = makeDoc({
      title: 'Grilled Salmon Bowl',
      ingredients: ['salmon fillet', 'rice', 'edamame', 'soy sauce'],
    });
    // AI identifies pescatarian
    const ai = makeAi('["pescatarian"]');

    const mask = await inferDietaryBitmask(doc, ai);

    // AI said pescatarian
    expect(mask & DIETARY_FLAGS.pescatarian).toBeTruthy();
  });

  it('returns 0 for a recipe with no dietary flags', async () => {
    const doc = makeDoc({
      title: 'Classic Beef Stew',
      ingredients: ['beef chuck', 'potatoes', 'carrots', 'onion', 'flour'],
    });
    const ai = makeAi('[]');

    const mask = await inferDietaryBitmask(doc, ai);

    expect(mask).toBe(0);
  });

  it('gracefully returns rule-based result when AI fails', async () => {
    const doc = makeDoc({
      title: 'Gluten-Free Pasta',
      ingredients: ['rice pasta', 'tomato sauce', 'basil'],
      keywords: ['gluten-free'],
    });
    const ai = makeAi(undefined, true);

    const mask = await inferDietaryBitmask(doc, ai);

    // Rule-based should still catch gluten-free
    expect(mask & DIETARY_FLAGS['gluten-free']).toBeTruthy();
    // AI was called but threw
    expect(ai.run).toHaveBeenCalled();
  });

  it('combines multiple keyword flags correctly', async () => {
    const doc = makeDoc({
      title: 'Keto Vegan Energy Bars',
      ingredients: ['coconut oil', 'almond butter', 'cocoa', 'stevia'],
      keywords: ['keto', 'vegan', 'sugar-free'],
    });
    const ai = makeAi('[]');

    const mask = await inferDietaryBitmask(doc, ai);

    // keto -> keto + low-carb
    expect(mask & DIETARY_FLAGS.keto).toBeTruthy();
    expect(mask & DIETARY_FLAGS['low-carb']).toBeTruthy();
    // vegan -> vegan + vegetarian + dairy-free + egg-free
    expect(mask & DIETARY_FLAGS.vegan).toBeTruthy();
    expect(mask & DIETARY_FLAGS.vegetarian).toBeTruthy();
    expect(mask & DIETARY_FLAGS['dairy-free']).toBeTruthy();
    expect(mask & DIETARY_FLAGS['egg-free']).toBeTruthy();
    // sugar-free
    expect(mask & DIETARY_FLAGS['sugar-free']).toBeTruthy();
  });

  it('matches keywords case-insensitively', async () => {
    const doc = makeDoc({
      title: 'VEGETARIAN Lasagna',
      ingredients: ['pasta sheets', 'ricotta', 'spinach'],
      keywords: ['HALAL', 'Kosher'],
    });
    const ai = makeAi('[]');

    const mask = await inferDietaryBitmask(doc, ai);

    expect(mask & DIETARY_FLAGS.vegetarian).toBeTruthy();
    expect(mask & DIETARY_FLAGS.halal).toBeTruthy();
    expect(mask & DIETARY_FLAGS.kosher).toBeTruthy();
  });
});

describe('ruleBasedScan', () => {
  it('detects keywords in ingredients', () => {
    const doc = makeDoc({
      title: 'Simple Salad',
      ingredients: ['lettuce', 'tomato', 'this is a nut-free dressing'],
    });

    const matched = ruleBasedScan(doc);
    expect(matched.has('nut-free')).toBe(true);
  });

  it('detects keywords in tags and category', () => {
    const doc = makeDoc({
      title: 'Pancakes',
      tags: ['paleo'],
      category: 'dairy-free breakfast',
    });

    const matched = ruleBasedScan(doc);
    expect(matched.has('paleo')).toBe(true);
    expect(matched.has('dairy-free')).toBe(true);
  });
});

describe('parseAiResponse', () => {
  it('parses valid JSON array', () => {
    expect(parseAiResponse('["vegan","keto"]')).toEqual(['vegan', 'keto']);
  });

  it('extracts array from surrounding text', () => {
    expect(
      parseAiResponse('Based on the ingredients: ["dairy-free"] is applicable.'),
    ).toEqual(['dairy-free']);
  });

  it('filters out invalid restriction names', () => {
    expect(parseAiResponse('["vegan","not-real","keto"]')).toEqual([
      'vegan',
      'keto',
    ]);
  });

  it('returns empty array for malformed response', () => {
    expect(parseAiResponse('I cannot determine')).toEqual([]);
  });

  it('returns empty array for empty array response', () => {
    expect(parseAiResponse('[]')).toEqual([]);
  });
});
