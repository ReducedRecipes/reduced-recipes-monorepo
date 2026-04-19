import { describe, it, expect, vi } from 'vitest';
import {
  parseIngredient,
  parseIngredientWithAI,
  canonicalise,
  singularise,
  stripDescriptors,
} from './ingredient-parser';

// ── singularise ────────��─────────────────────���──────────────────────

describe('singularise', () => {
  it('removes trailing s', () => {
    expect(singularise('onions')).toBe('onion');
    expect(singularise('carrots')).toBe('carrot');
  });

  it('handles -ies → -y', () => {
    expect(singularise('cherries')).toBe('cherry');
    expect(singularise('berries')).toBe('berry');
  });

  it('handles -ves → -f', () => {
    expect(singularise('halves')).toBe('half');
    expect(singularise('loaves')).toBe('loaf');
  });

  it('handles -ches/-shes → remove es', () => {
    expect(singularise('bunches')).toBe('bunch');
    expect(singularise('dashes')).toBe('dash');
  });

  it('handles -oes → remove es', () => {
    expect(singularise('tomatoes')).toBe('tomato');
    expect(singularise('potatoes')).toBe('potato');
  });

  it('does not over-singularise short words', () => {
    expect(singularise('as')).toBe('as');
  });

  it('does not remove ss', () => {
    expect(singularise('grass')).toBe('grass');
  });
});

// ── canonicalise ───────────────���─────────────────────────────���──────

describe('canonicalise', () => {
  it('lowercases, trims, and singularises', () => {
    expect(canonicalise('  Onions  ')).toBe('onion');
    expect(canonicalise('FLOUR')).toBe('flour');
    expect(canonicalise('Red Peppers')).toBe('red pepper');
  });
});

// ── parseIngredient (rule-based) ────────────────────────────────────

describe('parseIngredient', () => {
  it('parses "2 cups flour"', () => {
    const result = parseIngredient('2 cups flour');
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe('cup');
    expect(result.name).toBe('flour');
    expect(result.canonical_name).toBe('flour');
    expect(result.original_text).toBe('2 cups flour');
  });

  it('parses "1/2 tsp salt"', () => {
    const result = parseIngredient('1/2 tsp salt');
    expect(result.quantity).toBe(0.5);
    expect(result.unit).toBe('tsp');
    expect(result.name).toBe('salt');
    expect(result.canonical_name).toBe('salt');
  });

  it('parses "3-4 cloves garlic"', () => {
    const result = parseIngredient('3-4 cloves garlic');
    expect(result.quantity).toBe(3.5);
    expect(result.unit).toBe('clove');
    expect(result.name).toBe('garlic');
    expect(result.canonical_name).toBe('garlic');
  });

  it('parses "1 1/2 cups sugar"', () => {
    const result = parseIngredient('1 1/2 cups sugar');
    expect(result.quantity).toBe(1.5);
    expect(result.unit).toBe('cup');
    expect(result.name).toBe('sugar');
  });

  it('parses "salt and pepper to taste" (no quantity/unit)', () => {
    const result = parseIngredient('salt and pepper to taste');
    expect(result.quantity).toBeNull();
    expect(result.unit).toBe('');
    expect(result.name).toBe('salt and pepper to taste');
    expect(result.canonical_name).toBe('salt and pepper to taste');
  });

  it('parses "3 large eggs" (strips descriptor)', () => {
    const result = parseIngredient('3 large eggs');
    expect(result.quantity).toBe(3);
    expect(result.unit).toBe('');
    expect(result.name).toBe('eggs');
    expect(result.canonical_name).toBe('egg');
  });

  it('parses "500g chicken breast"', () => {
    const result = parseIngredient('500g chicken breast');
    expect(result.quantity).toBe(500);
    expect(result.unit).toBe('g');
    expect(result.name).toBe('chicken breast');
    expect(result.canonical_name).toBe('chicken breast');
  });

  it('parses "2.5 oz butter"', () => {
    const result = parseIngredient('2.5 oz butter');
    expect(result.quantity).toBe(2.5);
    expect(result.unit).toBe('oz');
    expect(result.name).toBe('butter');
  });

  it('parses unicode fractions like "½ cup milk"', () => {
    const result = parseIngredient('½ cup milk');
    expect(result.quantity).toBe(0.5);
    expect(result.unit).toBe('cup');
    expect(result.name).toBe('milk');
  });

  it('parses mixed unicode fractions like "1½ cups rice"', () => {
    const result = parseIngredient('1½ cups rice');
    expect(result.quantity).toBe(1.5);
    expect(result.unit).toBe('cup');
    expect(result.name).toBe('rice');
  });

  it('parses "1 tbsp. olive oil" (unit with period)', () => {
    const result = parseIngredient('1 tbsp. olive oil');
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe('tbsp');
    expect(result.name).toBe('olive oil');
  });

  it('handles empty string', () => {
    const result = parseIngredient('');
    expect(result.name).toBe('');
    expect(result.canonical_name).toBe('');
    expect(result.quantity).toBeNull();
    expect(result.unit).toBe('');
  });

  it('handles just a name with no quantity or unit (strips descriptor)', () => {
    const result = parseIngredient('fresh basil');
    expect(result.name).toBe('basil');
    expect(result.canonical_name).toBe('basil');
    expect(result.quantity).toBeNull();
    expect(result.unit).toBe('');
  });

  it('parses "2 bunches cilantro"', () => {
    const result = parseIngredient('2 bunches cilantro');
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe('bunch');
    expect(result.name).toBe('cilantro');
  });

  it('parses "1 pinch of saffron"', () => {
    const result = parseIngredient('1 pinch of saffron');
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe('pinch');
    expect(result.name).toBe('saffron');
  });

  it('preserves original_text', () => {
    const raw = '  2 cups  flour  ';
    const result = parseIngredient(raw);
    expect(result.original_text).toBe(raw);
  });
});

// ── stripDescriptors ──────────────────────────────────────────────

describe('stripDescriptors', () => {
  it('strips "large" from item name', () => {
    expect(stripDescriptors('large onion')).toBe('onion');
  });

  it('strips "finely chopped" from item name', () => {
    expect(stripDescriptors('finely chopped garlic')).toBe('garlic');
  });

  it('strips "dried" from item name', () => {
    expect(stripDescriptors('dried oregano')).toBe('oregano');
  });

  it('strips "frozen" from item name', () => {
    expect(stripDescriptors('frozen peas')).toBe('peas');
  });

  it('strips multiple descriptors', () => {
    expect(stripDescriptors('finely diced small red pepper')).toBe('red pepper');
  });

  it('preserves names with no descriptors', () => {
    expect(stripDescriptors('chicken breast')).toBe('chicken breast');
  });

  it('strips "grated" from item name', () => {
    expect(stripDescriptors('grated parmesan')).toBe('parmesan');
  });
});

// ── descriptor stripping in parseIngredient ────────────────────────

describe('parseIngredient descriptor stripping', () => {
  it('strips "chopped" from "1 cup chopped onions"', () => {
    const result = parseIngredient('1 cup chopped onions');
    expect(result.name).toBe('onions');
    expect(result.canonical_name).toBe('onion');
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe('cup');
  });

  it('strips "minced" from "2 cloves minced garlic"', () => {
    const result = parseIngredient('2 cloves minced garlic');
    expect(result.name).toBe('garlic');
    expect(result.canonical_name).toBe('garlic');
  });

  it('strips "diced" from "1 cup diced tomatoes"', () => {
    const result = parseIngredient('1 cup diced tomatoes');
    expect(result.name).toBe('tomatoes');
    expect(result.canonical_name).toBe('tomato');
  });

  it('strips "sliced" from "2 sliced mushrooms"', () => {
    const result = parseIngredient('2 sliced mushrooms');
    expect(result.name).toBe('mushrooms');
    expect(result.canonical_name).toBe('mushroom');
  });

  it('strips "coarsely ground" from "1 tsp coarsely ground black pepper"', () => {
    const result = parseIngredient('1 tsp coarsely ground black pepper');
    expect(result.name).toBe('black pepper');
    expect(result.canonical_name).toBe('black pepper');
  });
});

// ── range quantity parsing ──────────────────────────────────────────

describe('parseIngredient range quantities', () => {
  it('parses "2-3 cups flour" as midpoint 2.5', () => {
    const result = parseIngredient('2-3 cups flour');
    expect(result.quantity).toBe(2.5);
    expect(result.unit).toBe('cup');
    expect(result.name).toBe('flour');
  });

  it('parses "4-6 tomatoes" as midpoint 5', () => {
    const result = parseIngredient('4-6 tomatoes');
    expect(result.quantity).toBe(5);
    expect(result.name).toBe('tomatoes');
  });

  it('parses "1-2 tsp vanilla extract" as midpoint 1.5', () => {
    const result = parseIngredient('1-2 tsp vanilla extract');
    expect(result.quantity).toBe(1.5);
    expect(result.unit).toBe('tsp');
    expect(result.name).toBe('vanilla extract');
  });
});

// ── parseIngredientWithAI ───────────────────────────────────────────

describe('parseIngredientWithAI', () => {
  it('uses AI response when available', async () => {
    const mockAi = {
      run: vi.fn().mockResolvedValue({
        response: '{"name": "diced tomatoes", "quantity": 14, "unit": "oz"}',
      }),
    } as unknown as Ai;

    const result = await parseIngredientWithAI('1 (14 oz) can diced tomatoes', mockAi);
    expect(result.name).toBe('diced tomatoes');
    expect(result.quantity).toBe(14);
    expect(result.unit).toBe('oz');
    expect(result.canonical_name).toBe('diced tomato');
  });

  it('falls back to rule-based parser on AI error', async () => {
    const mockAi = {
      run: vi.fn().mockRejectedValue(new Error('AI unavailable')),
    } as unknown as Ai;

    const result = await parseIngredientWithAI('2 cups flour', mockAi);
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe('cup');
    expect(result.name).toBe('flour');
  });

  it('falls back to rule-based parser on invalid AI response', async () => {
    const mockAi = {
      run: vi.fn().mockResolvedValue({ response: 'I cannot parse this' }),
    } as unknown as Ai;

    const result = await parseIngredientWithAI('3 tbsp honey', mockAi);
    expect(result.quantity).toBe(3);
    expect(result.unit).toBe('tbsp');
    expect(result.name).toBe('honey');
  });
});
