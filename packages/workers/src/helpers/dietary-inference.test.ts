import { describe, it, expect, vi } from 'vitest';
import { inferDietaryBitmask } from './dietary-inference';
import { DIETARY_FLAGS } from '@rr/shared/dietary';

// ── Helpers ─────────────────────────────────────────────────────────

function makeAI(response: string) {
  return {
    run: vi.fn().mockResolvedValue({ response }),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('inferDietaryBitmask', () => {
  describe('rule-based inference', () => {
    it('identifies a purely vegan recipe', async () => {
      const recipe = {
        title: 'Tofu Stir Fry',
        ingredients: ['rice', 'tofu', 'soy sauce', 'vegetables', 'sesame oil'],
      };

      const mask = await inferDietaryBitmask(recipe);

      // Vegan + vegetarian + dairy-free + nut-free should be set
      // gluten-free should NOT be set (soy sauce)
      expect(mask & DIETARY_FLAGS.vegan).toBeTruthy();
      expect(mask & DIETARY_FLAGS.vegetarian).toBeTruthy();
      expect(mask & DIETARY_FLAGS['dairy-free']).toBeTruthy();
      expect(mask & DIETARY_FLAGS['nut-free']).toBeTruthy();
      expect(mask & DIETARY_FLAGS['gluten-free']).toBeFalsy();
    });

    it('excludes vegan/vegetarian/gluten-free/dairy-free for meat + butter + flour recipe', async () => {
      const recipe = {
        title: 'Chicken Parmesan',
        ingredients: ['chicken breast', 'butter', 'flour', 'parmesan cheese', 'tomato sauce'],
      };

      const mask = await inferDietaryBitmask(recipe);

      expect(mask & DIETARY_FLAGS.vegan).toBeFalsy();
      expect(mask & DIETARY_FLAGS.vegetarian).toBeFalsy();
      expect(mask & DIETARY_FLAGS['gluten-free']).toBeFalsy();
      expect(mask & DIETARY_FLAGS['dairy-free']).toBeFalsy();
      // nut-free should still be set (no nut keywords)
      expect(mask & DIETARY_FLAGS['nut-free']).toBeTruthy();
    });

    it('handles recipe with nuts', async () => {
      const recipe = {
        title: 'Almond Butter Toast',
        ingredients: ['bread', 'almond butter', 'honey'],
      };

      const mask = await inferDietaryBitmask(recipe);

      expect(mask & DIETARY_FLAGS['nut-free']).toBeFalsy();
      expect(mask & DIETARY_FLAGS['gluten-free']).toBeFalsy();
      expect(mask & DIETARY_FLAGS.vegan).toBeFalsy(); // honey
      expect(mask & DIETARY_FLAGS.vegetarian).toBeTruthy();
    });

    it('returns all rule-based flags for plain vegetable recipe', async () => {
      const recipe = {
        title: 'Simple Salad',
        ingredients: ['lettuce', 'tomato', 'cucumber', 'olive oil', 'lemon juice'],
      };

      const mask = await inferDietaryBitmask(recipe);

      expect(mask & DIETARY_FLAGS.vegan).toBeTruthy();
      expect(mask & DIETARY_FLAGS.vegetarian).toBeTruthy();
      expect(mask & DIETARY_FLAGS['gluten-free']).toBeTruthy();
      expect(mask & DIETARY_FLAGS['dairy-free']).toBeTruthy();
      expect(mask & DIETARY_FLAGS['nut-free']).toBeTruthy();
    });
  });

  describe('with AI binding', () => {
    it('calls AI for non-rule-based restrictions when AI binding provided', async () => {
      const recipe = {
        title: 'Chicken Rice Bowl',
        ingredients: ['chicken breast', 'rice', 'butter', 'flour'],
      };

      const ai = makeAI(
        'keto: NO\nhalal: YES\nkosher: YES\nlow-carb: NO\npaleo: NO\npescatarian: NO\negg-free: YES\nsoy-free: YES\nshellfish-free: YES\nlow-sodium: YES\nsugar-free: YES',
      );

      const mask = await inferDietaryBitmask(recipe, ai);

      // Rule-based: not vegan, not vegetarian, not gluten-free, not dairy-free, nut-free
      expect(mask & DIETARY_FLAGS.vegan).toBeFalsy();
      expect(mask & DIETARY_FLAGS.vegetarian).toBeFalsy();
      expect(mask & DIETARY_FLAGS['nut-free']).toBeTruthy();

      // AI-determined
      expect(mask & DIETARY_FLAGS.halal).toBeTruthy();
      expect(mask & DIETARY_FLAGS.kosher).toBeTruthy();
      expect(mask & DIETARY_FLAGS.keto).toBeFalsy();

      expect(ai.run).toHaveBeenCalledWith(
        '@cf/meta/llama-3-8b-instruct',
        expect.objectContaining({ prompt: expect.any(String) }),
      );
    });

    it('returns only rule-based result when AI binding is undefined', async () => {
      const recipe = {
        title: 'Veggie Bowl',
        ingredients: ['rice', 'tofu', 'vegetables'],
      };

      const mask = await inferDietaryBitmask(recipe, undefined);

      // Should have rule-based flags but no AI flags
      expect(mask & DIETARY_FLAGS.vegan).toBeTruthy();
      expect(mask & DIETARY_FLAGS.vegetarian).toBeTruthy();
      // AI-only flags should not be set without AI binding
      expect(mask & DIETARY_FLAGS.keto).toBeFalsy();
      expect(mask & DIETARY_FLAGS.halal).toBeFalsy();
    });

    it('handles AI response with varied formatting', async () => {
      const recipe = {
        title: 'Simple Rice',
        ingredients: ['rice', 'water', 'salt'],
      };

      const ai = makeAI('Keto YES\nHalal YES\nKosher: yes\nlow carb: NO');

      const mask = await inferDietaryBitmask(recipe, ai);

      expect(mask & DIETARY_FLAGS.keto).toBeTruthy();
      expect(mask & DIETARY_FLAGS.halal).toBeTruthy();
      expect(mask & DIETARY_FLAGS.kosher).toBeTruthy();
      expect(mask & DIETARY_FLAGS['low-carb']).toBeFalsy();
    });
  });

  describe('edge cases', () => {
    it('handles empty ingredients list', async () => {
      const recipe = { title: 'Mystery Dish', ingredients: [] };
      const mask = await inferDietaryBitmask(recipe);

      // No ingredients means no exclusions — all rule-based flags set
      expect(mask & DIETARY_FLAGS.vegan).toBeTruthy();
      expect(mask & DIETARY_FLAGS.vegetarian).toBeTruthy();
      expect(mask & DIETARY_FLAGS['gluten-free']).toBeTruthy();
      expect(mask & DIETARY_FLAGS['dairy-free']).toBeTruthy();
      expect(mask & DIETARY_FLAGS['nut-free']).toBeTruthy();
    });

    it('is case-insensitive for ingredient matching', async () => {
      const recipe = {
        title: 'Test',
        ingredients: ['CHICKEN Breast', 'BUTTER'],
      };
      const mask = await inferDietaryBitmask(recipe);

      expect(mask & DIETARY_FLAGS.vegan).toBeFalsy();
      expect(mask & DIETARY_FLAGS.vegetarian).toBeFalsy();
      expect(mask & DIETARY_FLAGS['dairy-free']).toBeFalsy();
    });
  });
});
