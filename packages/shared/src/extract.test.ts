import { describe, it, expect, vi } from 'vitest';
import {
  extractSchemaOrg,
  normaliseType,
  normaliseRecipe,
  extractInstructions,
  extractIngredients,
  extractImageUrl,
  extractTags,
  extractAuthor,
  extractKeywords,
} from './extract';

describe('extractSchemaOrg', () => {
  it('extracts Recipe from ld+json script', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{"@type":"Recipe","name":"Pasta"}</script>
      </head><body></body></html>
    `;
    const result = extractSchemaOrg(html);
    expect(result).toMatchObject({ '@type': 'Recipe', name: 'Pasta' });
  });

  it('extracts Recipe from @graph structure', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{
          "@graph": [
            {"@type": "WebSite", "name": "My Site"},
            {"@type": "Recipe", "name": "Cake"}
          ]
        }</script>
      </head><body></body></html>
    `;
    const result = extractSchemaOrg(html);
    expect(result).toMatchObject({ '@type': 'Recipe', name: 'Cake' });
  });

  it('returns null when no ld+json exists', () => {
    const html = '<html><head></head><body></body></html>';
    expect(extractSchemaOrg(html)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{bad json}</script>
      </head><body></body></html>
    `;
    expect(extractSchemaOrg(html)).toBeNull();
  });

  it('handles array of ld+json objects', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">[
          {"@type":"Organization","name":"Org"},
          {"@type":"Recipe","name":"Soup"}
        ]</script>
      </head><body></body></html>
    `;
    const result = extractSchemaOrg(html);
    expect(result).toMatchObject({ '@type': 'Recipe', name: 'Soup' });
  });
});

describe('normaliseType', () => {
  it('normalises string type', () => {
    expect(normaliseType('Recipe')).toBe('recipe');
  });

  it('strips schema.org prefix', () => {
    expect(normaliseType('https://schema.org/Recipe')).toBe('recipe');
    expect(normaliseType('http://schema.org/Recipe')).toBe('recipe');
  });

  it('handles array type', () => {
    expect(normaliseType(['Recipe', 'Thing'])).toBe('recipe');
  });

  it('returns empty string for undefined', () => {
    expect(normaliseType(undefined)).toBe('');
  });
});

describe('normaliseRecipe', () => {
  it('produces correct RecipeDocument shape', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });

    const raw = {
      name: 'Test Recipe',
      image: 'https://example.com/img.jpg',
      author: { name: 'Chef' },
      recipeYield: '4 servings',
      prepTime: 'PT10M',
      cookTime: 'PT20M',
      totalTime: 'PT30M',
      recipeIngredient: ['flour', 'sugar'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Mix ingredients' },
        { '@type': 'HowToStep', text: 'Bake' },
      ],
      keywords: 'dessert, easy',
      recipeCuisine: 'American',
      recipeCategory: 'Dessert',
    };

    const doc = normaliseRecipe(raw, 'https://www.example.com/recipe/1');

    expect(doc.id).toBe('test-uuid');
    expect(doc.source_url).toBe('https://www.example.com/recipe/1');
    expect(doc.domain).toBe('example.com');
    expect(doc.title).toBe('Test Recipe');
    expect(doc.image_url).toBe('https://example.com/img.jpg');
    expect(doc.author).toBe('Chef');
    expect(doc.yields).toBe('4 servings');
    expect(doc.prep_time).toBe(10);
    expect(doc.cook_time).toBe(20);
    expect(doc.total_time).toBe(30);
    expect(doc.ingredients).toEqual(['flour', 'sugar']);
    expect(doc.instructions).toEqual(['Mix ingredients', 'Bake']);
    expect(doc.tags).toContain('dessert');
    expect(doc.tags).toContain('easy');
    expect(doc.tags).toContain('american');
    expect(doc.cuisine).toBe('American');
    expect(doc.category).toBe('Dessert');
    expect(doc.schema_valid).toBe(true);
    expect(doc.extracted_at).toBeDefined();

    vi.unstubAllGlobals();
  });

  it('handles missing optional fields', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-2' });

    const raw = { name: 'Simple' };
    const doc = normaliseRecipe(raw, 'https://example.com/r');

    expect(doc.title).toBe('Simple');
    expect(doc.image_url).toBeNull();
    expect(doc.author).toBeNull();
    expect(doc.yields).toBeNull();
    expect(doc.prep_time).toBeNull();
    expect(doc.cook_time).toBeNull();
    expect(doc.total_time).toBeNull();
    expect(doc.ingredients).toEqual([]);
    expect(doc.instructions).toEqual([]);

    vi.unstubAllGlobals();
  });
});

describe('extractInstructions', () => {
  it('handles string instructions', () => {
    expect(extractInstructions('Mix well')).toEqual(['Mix well']);
  });

  it('handles HowToStep array', () => {
    const steps = [
      { '@type': 'HowToStep', text: 'Step 1' },
      { '@type': 'HowToStep', text: 'Step 2' },
    ];
    expect(extractInstructions(steps)).toEqual(['Step 1', 'Step 2']);
  });

  it('handles HowToSection with nested steps', () => {
    const sections = [
      {
        '@type': 'HowToSection',
        itemListElement: [
          { '@type': 'HowToStep', text: 'Nested step' },
        ],
      },
    ];
    expect(extractInstructions(sections)).toEqual(['Nested step']);
  });

  it('returns empty array for null/undefined', () => {
    expect(extractInstructions(null)).toEqual([]);
    expect(extractInstructions(undefined)).toEqual([]);
  });
});

describe('extractImageUrl', () => {
  it('handles string URL', () => {
    expect(extractImageUrl('https://example.com/img.jpg')).toBe('https://example.com/img.jpg');
  });

  it('handles object with url property', () => {
    expect(extractImageUrl({ url: 'https://example.com/img.jpg' })).toBe('https://example.com/img.jpg');
  });

  it('handles array', () => {
    expect(extractImageUrl(['https://example.com/img.jpg'])).toBe('https://example.com/img.jpg');
  });

  it('returns null for missing', () => {
    expect(extractImageUrl(null)).toBeNull();
    expect(extractImageUrl(undefined)).toBeNull();
  });
});

describe('extractTags', () => {
  it('merges keywords, cuisine, and category', () => {
    const tags = extractTags('dessert, easy', 'Italian', 'Main');
    expect(tags).toContain('dessert');
    expect(tags).toContain('easy');
    expect(tags).toContain('italian');
    expect(tags).toContain('main');
  });

  it('deduplicates tags', () => {
    const tags = extractTags('Italian', 'Italian', null);
    expect(tags.filter(t => t === 'italian')).toHaveLength(1);
  });
});

describe('extractAuthor', () => {
  it('handles string author', () => {
    expect(extractAuthor('Chef Test')).toBe('Chef Test');
  });

  it('handles object author', () => {
    expect(extractAuthor({ name: 'Chef Test' })).toBe('Chef Test');
  });

  it('handles array author', () => {
    expect(extractAuthor(['Chef Test'])).toBe('Chef Test');
  });

  it('returns null for missing', () => {
    expect(extractAuthor(null)).toBeNull();
  });
});

describe('extractKeywords', () => {
  it('splits comma-separated string', () => {
    expect(extractKeywords('easy, quick, healthy')).toEqual(['easy', 'quick', 'healthy']);
  });

  it('handles array', () => {
    expect(extractKeywords(['easy', 'quick'])).toEqual(['easy', 'quick']);
  });

  it('returns empty for missing', () => {
    expect(extractKeywords(null)).toEqual([]);
  });
});
