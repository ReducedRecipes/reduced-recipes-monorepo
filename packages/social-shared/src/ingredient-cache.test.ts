import { describe, expect, it } from 'vitest';
import { normaliseIngredientKey } from './ingredient-cache';

describe('normaliseIngredientKey', () => {
  it('strips quantities and units', () => {
    expect(normaliseIngredientKey('1 cup chopped Garlic')).toBe('garlic');
    expect(normaliseIngredientKey('2 tbsp olive oil')).toBe('olive oil');
    expect(normaliseIngredientKey('500 g tomatoes')).toBe('tomato');
  });
  it('singularises common plurals', () => {
    expect(normaliseIngredientKey('tomatoes')).toBe('tomato');
    expect(normaliseIngredientKey('eggs')).toBe('egg');
    expect(normaliseIngredientKey('5 lemons')).toBe('lemon');
  });
  it('handles preparation modifiers', () => {
    expect(normaliseIngredientKey('finely diced fresh ginger')).toBe('ginger');
    expect(normaliseIngredientKey('large yellow onion, sliced')).toBe('yellow onion');
  });
  it('returns empty string for input that is only stopwords', () => {
    expect(normaliseIngredientKey('a pinch of')).toBe('');
  });
});
