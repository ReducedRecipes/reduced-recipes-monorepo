/**
 * Integration test: happy-path flow
 * Fetch recipe → save to SQLite → add to shopping list
 *
 * Mocks only the external boundaries (fetch, expo-sqlite) and exercises
 * the real api client, queries, stores, and categorisation together.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecipeDocument } from '@rr/shared';
import { api } from '../lib/api';
import { upsertRecipe, getSavedRecipe } from '../db/queries';
import { useSavedStore } from '../stores/saved.store';
import { useShoppingStore } from '../stores/shopping.store';

// --- Test fixture ---

const mockRecipe: RecipeDocument = {
  id: 'integration-recipe-1',
  source_url: 'https://example.com/pasta-recipe',
  domain: 'example.com',
  title: 'Simple Garlic Pasta',
  image_url: 'https://example.com/pasta.jpg',
  author: 'Chef Integration',
  yields: '4 servings',
  prep_time: 10,
  cook_time: 15,
  total_time: 25,
  ingredients: ['400g pasta', '4 cloves garlic', '3 tbsp olive oil', '1 tsp salt', 'fresh parsley'],
  instructions: ['Cook pasta al dente', 'Sauté garlic in olive oil', 'Toss with pasta and parsley'],
  tags: ['italian', 'quick', 'vegetarian'],
  cuisine: 'Italian',
  category: 'Main Course',
  keywords: ['pasta', 'garlic', 'easy'],
  schema_valid: true,
  extracted_at: '2024-06-01T12:00:00Z',
  last_checked: '2024-06-02T12:00:00Z',
};

// --- Mock external boundary: fetch ---

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// --- Mock external boundary: expo-sqlite database ---

function createMockDb() {
  const storage = new Map<string, any>();

  return {
    getFirstAsync: vi.fn(async (_sql: string, params: any[]) => {
      return storage.get(params[0]) ?? null;
    }),
    getAllAsync: vi.fn(async () => {
      return [...storage.values()];
    }),
    runAsync: vi.fn(async (_sql: string, params: any[]) => {
      // Simulates INSERT or UPDATE — store the serialized row keyed by id
      const id = params[0] as string;
      storage.set(id, {
        id: params[0],
        source_url: params[1],
        domain: params[2],
        title: params[3],
        image_url: params[4],
        author: params[5],
        yields: params[6],
        prep_time: params[7],
        cook_time: params[8],
        total_time: params[9],
        ingredients: params[10],
        instructions: params[11],
        tags: params[12],
        cuisine: params[13],
        category: params[14],
        keywords: params[15],
        schema_valid: params[16],
        extracted_at: params[17],
        last_checked: params[18],
        saved_at: new Date().toISOString(),
      });
    }),
    execAsync: vi.fn(),
  };
}

describe('Happy-path integration: fetch → save → shopping list', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    mockFetch.mockReset();

    // Reset Zustand stores to initial state
    useSavedStore.setState({ ids: new Set<string>() });
    useShoppingStore.setState({ items: [] });
  });

  it('fetches a recipe via API, saves to SQLite, and adds ingredients to the shopping list', async () => {
    // Step 1: Mock the fetch response for api.recipes.get
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockRecipe,
    });

    // Fetch recipe through the real API client
    const recipe = await api.recipes.get('integration-recipe-1');

    // Verify the API client returned the correct recipe
    expect(recipe.id).toBe('integration-recipe-1');
    expect(recipe.title).toBe('Simple Garlic Pasta');
    expect(recipe.ingredients).toHaveLength(5);

    // Step 2: Save the fetched recipe to SQLite via queries module
    await upsertRecipe(db as any, recipe);

    // Verify it was persisted — read it back
    const saved = await getSavedRecipe(db as any, recipe.id);
    expect(saved).not.toBeNull();
    expect(saved!.id).toBe('integration-recipe-1');
    expect(saved!.title).toBe('Simple Garlic Pasta');
    // JSON arrays should be deserialized back correctly
    expect(saved!.ingredients).toEqual(recipe.ingredients);
    expect(saved!.tags).toEqual(['italian', 'quick', 'vegetarian']);
    expect(saved!.schema_valid).toBe(true);

    // Update the saved-recipes store to track this ID
    useSavedStore.getState().addId(recipe.id);
    expect(useSavedStore.getState().isSaved('integration-recipe-1')).toBe(true);

    // Step 3: Add the recipe's ingredients to the shopping list
    useShoppingStore.getState().addFromRecipe(
      recipe.id,
      recipe.title,
      recipe.ingredients,
    );

    const items = useShoppingStore.getState().items;
    expect(items).toHaveLength(5);

    // All items should reference the source recipe
    for (const item of items) {
      expect(item.recipeId).toBe('integration-recipe-1');
      expect(item.recipeTitle).toBe('Simple Garlic Pasta');
      expect(item.checked).toBe(false);
    }

    // Verify categorisation was applied correctly by the real categoriseIngredient
    const byText = new Map(items.map((i) => [i.text, i.category]));
    expect(byText.get('400g pasta')).toBe('Pantry');
    expect(byText.get('4 cloves garlic')).toBe('Produce');
    expect(byText.get('3 tbsp olive oil')).toBe('Pantry');
    expect(byText.get('1 tsp salt')).toBe('Spices');
    expect(byText.get('fresh parsley')).toBe('Produce');
  });

  it('persists correct data types through the SQLite round-trip', async () => {
    // Save and read back to verify serialization integrity
    await upsertRecipe(db as any, mockRecipe);
    const saved = await getSavedRecipe(db as any, mockRecipe.id);

    expect(saved).not.toBeNull();
    // Verify JSON fields survived serialization
    expect(Array.isArray(saved!.ingredients)).toBe(true);
    expect(Array.isArray(saved!.instructions)).toBe(true);
    expect(Array.isArray(saved!.tags)).toBe(true);
    expect(Array.isArray(saved!.keywords)).toBe(true);

    // Boolean → INTEGER → Boolean round-trip
    expect(typeof saved!.schema_valid).toBe('boolean');
    expect(saved!.schema_valid).toBe(true);

    // Numeric fields preserved
    expect(saved!.prep_time).toBe(10);
    expect(saved!.cook_time).toBe(15);
    expect(saved!.total_time).toBe(25);

    // saved_at should have been set during insert
    expect(saved!.saved_at).toBeDefined();
  });

  it('shopping list items get unique IDs and can be toggled', async () => {
    // Simulate the full flow quickly
    useShoppingStore.getState().addFromRecipe(
      mockRecipe.id,
      mockRecipe.title,
      mockRecipe.ingredients,
    );

    const items = useShoppingStore.getState().items;
    const ids = items.map((i) => i.id);

    // All IDs should be unique
    expect(new Set(ids).size).toBe(ids.length);

    // Toggle the first item
    useShoppingStore.getState().toggle(ids[0]);
    expect(useShoppingStore.getState().items[0].checked).toBe(true);

    // Clear checked items
    useShoppingStore.getState().clearChecked();
    expect(useShoppingStore.getState().items).toHaveLength(4);
  });
});
