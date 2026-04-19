/**
 * Ingredient canon service — resolves ingredient names to canonical forms
 * with store categories.
 *
 * Lookup chain:
 * 1. Normalise name → KV get ingredient:{name}
 * 2. On KV miss → D1 query ingredient_canon table
 * 3. On D1 miss → Workers AI classify → store in D1 + KV
 *
 * KV cache key pattern: ingredient:{normalised_name} with 30-day TTL.
 */

import type { Env } from '@rr/shared/env';

export interface CanonResult {
  canonical_name: string;
  category: string;
}

const KV_TTL = 2592000; // 30 days in seconds

const CATEGORIES = [
  'Produce',
  'Dairy',
  'Meat & Seafood',
  'Pantry',
  'Frozen',
  'Bakery',
  'Beverages',
  'Spices & Seasonings',
  'Other',
] as const;

/**
 * Normalise an ingredient name for cache key generation.
 * Lowercase, trim, collapse whitespace.
 */
export function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Build the KV cache key for a normalised ingredient name.
 */
function kvKey(normalised: string): string {
  return `ingredient:${normalised}`;
}

/**
 * Resolve an ingredient name to its canonical form and store category.
 *
 * Lookup chain: KV cache → D1 → Workers AI (with write-back).
 */
export async function resolveCanon(
  itemName: string,
  env: Env,
): Promise<CanonResult> {
  const normalised = normaliseName(itemName);

  if (!normalised) {
    return { canonical_name: itemName, category: 'Other' };
  }

  // 1. KV cache lookup
  const cached = await env.CACHE_KV.get(kvKey(normalised));
  if (cached) {
    try {
      return JSON.parse(cached) as CanonResult;
    } catch {
      // Corrupted cache entry — fall through
    }
  }

  // 2. D1 lookup
  if (env.USERS_DB) {
    const row = await env.USERS_DB
      .prepare('SELECT canonical_name, category FROM ingredient_canon WHERE canonical_name = ?')
      .bind(normalised)
      .first<{ canonical_name: string; category: string }>();

    if (row) {
      const result: CanonResult = {
        canonical_name: row.canonical_name,
        category: row.category,
      };
      // Populate KV cache
      await env.CACHE_KV.put(kvKey(normalised), JSON.stringify(result), {
        expirationTtl: KV_TTL,
      });
      return result;
    }
  }

  // 3. Workers AI classification
  if (env.AI) {
    try {
      const result = await classifyWithAI(normalised, env.AI);

      // Store in D1
      if (env.USERS_DB) {
        const now = new Date().toISOString();
        await env.USERS_DB
          .prepare(
            'INSERT OR IGNORE INTO ingredient_canon (canonical_name, aliases, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          )
          .bind(result.canonical_name, '[]', result.category, now, now)
          .run();
      }

      // Store in KV
      await env.CACHE_KV.put(kvKey(normalised), JSON.stringify(result), {
        expirationTtl: KV_TTL,
      });

      return result;
    } catch {
      // AI failure — return sensible default
    }
  }

  // Fallback — no AI available or AI failed
  return { canonical_name: normalised, category: 'Other' };
}

/**
 * Classify an ingredient using Workers AI.
 * Returns canonical name and category.
 */
async function classifyWithAI(
  normalised: string,
  ai: Ai,
): Promise<CanonResult> {
  const result = (await ai.run('@cf/meta/llama-3-8b-instruct', {
    messages: [
      {
        role: 'system',
        content: `You are an ingredient classifier. Given an ingredient name, return its canonical (simplest/most common) name and the store category it belongs to.

Respond ONLY with a JSON object: {"canonical_name": "name", "category": "category"}

Valid categories: ${CATEGORIES.join(', ')}

Examples:
- "baby spinach" → {"canonical_name": "spinach", "category": "Produce"}
- "unsalted butter" → {"canonical_name": "butter", "category": "Dairy"}
- "boneless chicken breast" → {"canonical_name": "chicken breast", "category": "Meat & Seafood"}
- "all-purpose flour" → {"canonical_name": "flour", "category": "Pantry"}
- "ground cumin" → {"canonical_name": "cumin", "category": "Spices & Seasonings"}`,
      },
      { role: 'user', content: normalised },
    ],
  })) as { response?: string };

  if (result?.response) {
    const jsonMatch = result.response.match(/\{.*\}/s);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const canonical = typeof parsed.canonical_name === 'string'
        ? parsed.canonical_name.trim().toLowerCase()
        : normalised;
      const category = typeof parsed.category === 'string' && CATEGORIES.includes(parsed.category as typeof CATEGORIES[number])
        ? parsed.category
        : 'Other';

      return { canonical_name: canonical, category };
    }
  }

  throw new Error('AI did not return a valid response');
}
