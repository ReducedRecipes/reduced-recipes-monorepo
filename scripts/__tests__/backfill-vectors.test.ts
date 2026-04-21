import { describe, it, expect } from "vitest";
import {
  buildEmbeddingText,
  buildVectorRecord,
  EMBEDDING_MODEL,
  VECTORIZE_BATCH_SIZE,
  CURSOR_KEY,
  D1_PAGE_SIZE,
} from "../backfill-vectors";
import type { RecipeDocument } from "@rr/shared";
import type { RecipeRow } from "../backfill-vectors";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const minimalDoc: RecipeDocument = {
  id: "abc123",
  source_url: "https://example.com/pasta",
  domain: "example.com",
  title: "Spaghetti Carbonara",
  image_url: null,
  author: null,
  yields: null,
  prep_time: null,
  cook_time: null,
  total_time: 30,
  ingredients: [],
  instructions: [],
  tags: [],
  cuisine: null,
  category: null,
  keywords: [],
  schema_valid: true,
  extracted_at: "2026-01-01T00:00:00Z",
  last_checked: "2026-01-01T00:00:00Z",
};

const fullDoc: RecipeDocument = {
  ...minimalDoc,
  title: "Spaghetti Carbonara",
  cuisine: "Italian",
  category: "Pasta",
  ingredients: ["spaghetti", "guanciale", "eggs", "pecorino romano", "black pepper"],
};

const minimalRow: RecipeRow = {
  id: "abc123",
  domain: "example.com",
  dietary_bitmask: null,
  total_time: null,
};

const fullRow: RecipeRow = {
  id: "abc123",
  domain: "simplyrecipes.com",
  dietary_bitmask: 5,
  total_time: 30,
};

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("EMBEDDING_MODEL is the embeddinggemma model (768 dims)", () => {
    expect(EMBEDDING_MODEL).toBe("@cf/google/embeddinggemma-300m");
  });

  it("VECTORIZE_BATCH_SIZE is 1000 (Vectorize limit)", () => {
    expect(VECTORIZE_BATCH_SIZE).toBe(1_000);
  });

  it("CURSOR_KEY is the expected KV key", () => {
    expect(CURSOR_KEY).toBe("vector_backfill_cursor");
  });

  it("D1_PAGE_SIZE is 1000", () => {
    expect(D1_PAGE_SIZE).toBe(1_000);
  });
});

// ── buildEmbeddingText ────────────────────────────────────────────────────────

describe("buildEmbeddingText", () => {
  it("returns just the title when cuisine, category, and ingredients are absent", () => {
    const text = buildEmbeddingText(minimalDoc);
    expect(text).toBe("Spaghetti Carbonara");
  });

  it("includes cuisine after title separated by |", () => {
    const doc = { ...minimalDoc, cuisine: "Italian" };
    const text = buildEmbeddingText(doc);
    expect(text).toBe("Spaghetti Carbonara | Italian");
  });

  it("includes category after cuisine separated by |", () => {
    const doc = { ...minimalDoc, cuisine: "Italian", category: "Pasta" };
    const text = buildEmbeddingText(doc);
    expect(text).toBe("Spaghetti Carbonara | Italian | Pasta");
  });

  it("appends comma-joined ingredients last", () => {
    const text = buildEmbeddingText(fullDoc);
    expect(text).toBe(
      "Spaghetti Carbonara | Italian | Pasta | spaghetti, guanciale, eggs, pecorino romano, black pepper"
    );
  });

  it("skips null cuisine and uses category directly", () => {
    const doc = { ...minimalDoc, cuisine: null, category: "Dessert", ingredients: ["flour", "sugar"] };
    const text = buildEmbeddingText(doc);
    expect(text).toBe("Spaghetti Carbonara | Dessert | flour, sugar");
  });

  it("skips null category and uses ingredients directly after cuisine", () => {
    const doc = { ...minimalDoc, cuisine: "French", category: null, ingredients: ["butter"] };
    const text = buildEmbeddingText(doc);
    expect(text).toBe("Spaghetti Carbonara | French | butter");
  });

  it("handles an empty ingredients array", () => {
    const doc = { ...fullDoc, ingredients: [] };
    const text = buildEmbeddingText(doc);
    expect(text).toBe("Spaghetti Carbonara | Italian | Pasta");
  });

  it("handles a title with pipe characters gracefully (no crash)", () => {
    const doc = { ...minimalDoc, title: "A | B recipe" };
    const text = buildEmbeddingText(doc);
    expect(text).toContain("A | B recipe");
  });
});

// ── buildVectorRecord ─────────────────────────────────────────────────────────

describe("buildVectorRecord", () => {
  const embedding = Array.from({ length: 768 }, (_, i) => i / 768);

  it("sets id from row.id", () => {
    const record = buildVectorRecord(fullRow, embedding);
    expect(record.id).toBe("abc123");
  });

  it("stores the embedding values as-is", () => {
    const record = buildVectorRecord(fullRow, embedding);
    expect(record.values).toBe(embedding);
    expect(record.values).toHaveLength(768);
  });

  it("populates metadata fields from row", () => {
    const record = buildVectorRecord(fullRow, embedding);
    expect(record.metadata).toEqual({
      recipe_id: "abc123",
      domain: "simplyrecipes.com",
      dietary_bitmask: 5,
      total_time: 30,
    });
  });

  it("defaults dietary_bitmask to 0 when row value is null", () => {
    const record = buildVectorRecord(minimalRow, embedding);
    expect(record.metadata.dietary_bitmask).toBe(0);
  });

  it("defaults total_time to 0 when row value is null", () => {
    const record = buildVectorRecord(minimalRow, embedding);
    expect(record.metadata.total_time).toBe(0);
  });

  it("always echoes recipe_id equal to id", () => {
    const record = buildVectorRecord(fullRow, embedding);
    expect(record.metadata.recipe_id).toBe(record.id);
  });
});
