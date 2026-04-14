import type { RecipeDocument } from "./types.js";
import { cleanText, parseDuration } from "./utils.js";

/**
 * Extract a Schema.org Recipe object from HTML by parsing all ld+json script blocks.
 * Handles @graph structures and arrays of objects.
 */
export function extractSchemaOrg(html: string): Record<string, unknown> | null {
  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]!);
      const candidates = Array.isArray(json) ? json : [json];

      for (const candidate of candidates) {
        if (candidate["@graph"]) {
          const recipe = (candidate["@graph"] as unknown[]).find(
            (n: unknown) =>
              normaliseType((n as Record<string, unknown>)["@type"] as string | string[] | undefined) === "recipe"
          );
          if (recipe) return recipe as Record<string, unknown>;
        }

        if (normaliseType(candidate["@type"] as string | string[] | undefined) === "recipe") {
          return candidate as Record<string, unknown>;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Normalise a Schema.org @type value to a lowercase string without the schema.org prefix.
 */
export function normaliseType(type: string | string[] | undefined): string {
  if (!type) return "";
  const t = Array.isArray(type) ? type[0]! : type;
  return t
    .toLowerCase()
    .replace("https://schema.org/", "")
    .replace("http://schema.org/", "");
}

/**
 * Convert a raw Schema.org Recipe object into a normalised RecipeDocument.
 */
export function normaliseRecipe(
  raw: Record<string, unknown>,
  sourceUrl: string
): RecipeDocument {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  return {
    id,
    url: sourceUrl,
    canonical_url: typeof raw.url === "string" ? raw.url : sourceUrl,
    source_url: sourceUrl,
    domain: new URL(sourceUrl).hostname.replace(/^www\./, ""),
    title: cleanText(String(raw.name ?? raw.headline ?? "")),
    description: cleanText(String(raw.description ?? "")),
    author: extractAuthor(raw.author),
    image_url: extractImageUrl(raw.image) ?? "",
    prep_time: parseDuration(String(raw.prepTime ?? "")),
    cook_time: parseDuration(String(raw.cookTime ?? "")),
    total_time: parseDuration(String(raw.totalTime ?? "")),
    servings: raw.recipeYield != null ? cleanText(String(raw.recipeYield)) || null : null,
    ingredients: extractIngredients(raw.recipeIngredient),
    instructions: extractInstructions(raw.recipeInstructions),
    tags: extractTags(raw.keywords, raw.recipeCuisine, raw.recipeCategory),
    cuisine: raw.recipeCuisine != null ? cleanText(String(raw.recipeCuisine)) || null : null,
    crawled_at: now,
    updated_at: now,
  };
}

/**
 * Extract instructions from Schema.org recipeInstructions.
 * Handles string, HowToStep, HowToSection, and arrays thereof.
 */
export function extractInstructions(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === "string") return [cleanText(raw)];
  if (Array.isArray(raw)) {
    return raw
      .flatMap((step: unknown) => {
        if (typeof step === "string") return [cleanText(step)];
        const obj = step as Record<string, unknown>;
        if (obj["@type"] === "HowToStep")
          return [cleanText(String(obj.text ?? obj.name ?? ""))];
        if (obj["@type"] === "HowToSection")
          return extractInstructions(obj.itemListElement);
        return [];
      })
      .filter(Boolean);
  }
  return [];
}

/**
 * Extract ingredients from Schema.org recipeIngredient.
 */
export function extractIngredients(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw))
    return raw.map((i: unknown) => cleanText(String(i))).filter(Boolean);
  return [];
}

/**
 * Extract image URL from Schema.org image field.
 * Handles string, array, and object ({url, contentUrl}) formats.
 */
export function extractImageUrl(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return extractImageUrl(raw[0]);
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return (obj.url ?? obj.contentUrl ?? null) as string | null;
  }
  return null;
}

/**
 * Merge keywords, cuisine, and category into a deduplicated lowercase tag set.
 */
export function extractTags(
  keywords: unknown,
  cuisine: unknown,
  category: unknown
): string[] {
  const tags = new Set<string>();

  if (typeof keywords === "string") {
    keywords
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean)
      .forEach((t) => tags.add(t));
  }
  if (Array.isArray(keywords)) {
    keywords
      .map((k: unknown) => String(k).trim().toLowerCase())
      .filter(Boolean)
      .forEach((t: string) => tags.add(t));
  }
  if (typeof cuisine === "string") tags.add(cuisine.toLowerCase());
  if (Array.isArray(cuisine))
    cuisine.forEach((c: unknown) => tags.add(String(c).toLowerCase()));
  if (typeof category === "string") tags.add(category.toLowerCase());

  return [...tags].filter(Boolean);
}

/**
 * Extract author name from Schema.org author field.
 * Handles string, object ({name}), and array formats.
 */
export function extractAuthor(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return cleanText(raw);
  if (Array.isArray(raw)) return extractAuthor(raw[0]);
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return cleanText(String(obj.name ?? ""));
  }
  return "";
}

/**
 * Extract keywords as an array of strings.
 */
export function extractKeywords(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === "string")
    return raw
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  if (Array.isArray(raw)) return raw.map((k: unknown) => String(k).trim()).filter(Boolean);
  return [];
}
