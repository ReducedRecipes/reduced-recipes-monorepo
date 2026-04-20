# ReducedRecipes — Ingredient-Based Search Specification

**Version:** 1.0
**Date:** 2026-04-20
**Status:** Draft

---

## Overview

"What's in your fridge" — users provide ingredients they have on hand and optionally exclude ingredients they want to avoid. The system returns recipes ranked by how well they match, with fewest extra ingredients needed shown first.

This is a core differentiator for ReducedRecipes — most recipe sites search by title/keyword. Ingredient-based search answers "what can I actually cook tonight?"

---

## User Experience

### Input
- **Have ingredients**: user adds ingredients they have (e.g. chicken, garlic, lemon)
- **Exclude ingredients**: user adds ingredients to avoid (e.g. mushrooms, shellfish)
- Both lists support autocomplete from a known ingredient vocabulary

### Output
- Recipes ranked by **fewest extra ingredients needed** (ingredients the user doesn't have)
- Each result shows:
  - Recipe title, image, cook time
  - Match score: "You have 8/10 ingredients"
  - Missing ingredients listed (so user knows what to buy)
- Paginated with load-more

### Example
User has: `chicken, garlic, lemon, olive oil, salt`
User excludes: `mushrooms`

Results:
1. **Lemon Garlic Chicken** — You have 5/6 ingredients (need: black pepper)
2. **Chicken Piccata** — You have 5/8 ingredients (need: capers, butter, flour)
3. **Garlic Butter Chicken** — You have 4/7 ingredients (need: butter, parsley, thyme)

---

## Technical Approach

### Data Model

Recipes already have ingredients as raw strings in KV (`doc.ingredients[]`). For efficient ingredient matching, we need a normalised ingredient index in D1.

#### New table: `recipe_ingredients`

```sql
CREATE TABLE recipe_ingredients (
  recipe_id    TEXT NOT NULL,
  ingredient   TEXT NOT NULL,  -- normalised ingredient name (lowercase, singular)
  PRIMARY KEY (recipe_id, ingredient)
);

CREATE INDEX idx_ri_ingredient ON recipe_ingredients(ingredient);
```

Each recipe's raw ingredient strings get parsed down to their core ingredient name:
- "2 cups all-purpose flour, sifted" → `flour`
- "3 cloves garlic, minced" → `garlic`
- "1 lb boneless skinless chicken thighs" → `chicken`
- "½ tsp freshly ground black pepper" → `black pepper`

#### Ingredient vocabulary table

```sql
CREATE TABLE ingredients (
  name       TEXT PRIMARY KEY,  -- normalised name
  aliases    TEXT,              -- JSON array of aliases (e.g. ["capsicum", "bell pepper"])
  category   TEXT,              -- produce, protein, dairy, pantry, spice, etc.
  count      INTEGER DEFAULT 0  -- number of recipes using this ingredient
);
```

### Parsing Pipeline

Reuse the existing ingredient parsing from the shopping list feature (Phase 2). During projection, extract the core ingredient name from each raw ingredient string and insert into `recipe_ingredients`.

For existing recipes (~155k), run a one-off backfill job:
1. Read each recipe from KV
2. Parse ingredient strings → normalised names
3. Insert into `recipe_ingredients`

Use Workers AI (Llama 3.1) for ambiguous cases, rule-based for common patterns. Cost: negligible (~$0.002/recipe if AI needed, most will be rule-based).

### Search Algorithm

```
GET /api/v1/search/by-ingredients?have=chicken,garlic,lemon&exclude=mushrooms&limit=24&offset=0
```

Query strategy:
1. Find recipes that contain ANY of the "have" ingredients
2. Exclude recipes that contain ANY of the "exclude" ingredients
3. For each remaining recipe, count how many of the user's "have" ingredients appear
4. Rank by: (matched ingredients / total recipe ingredients) DESC
5. Return with match metadata

**SQL approach:**

```sql
-- Step 1: Find candidate recipes (have at least one matching ingredient)
WITH matched AS (
  SELECT recipe_id, COUNT(*) as match_count
  FROM recipe_ingredients
  WHERE ingredient IN ('chicken', 'garlic', 'lemon')
  GROUP BY recipe_id
),
-- Step 2: Exclude recipes with unwanted ingredients
excluded AS (
  SELECT DISTINCT recipe_id
  FROM recipe_ingredients
  WHERE ingredient IN ('mushrooms')
),
-- Step 3: Get total ingredient count per recipe
totals AS (
  SELECT recipe_id, COUNT(*) as total_count
  FROM recipe_ingredients
  GROUP BY recipe_id
)
SELECT
  m.recipe_id,
  m.match_count,
  t.total_count,
  (t.total_count - m.match_count) as missing_count
FROM matched m
JOIN totals t ON t.recipe_id = m.recipe_id
WHERE m.recipe_id NOT IN (SELECT recipe_id FROM excluded)
ORDER BY missing_count ASC, m.match_count DESC
LIMIT 25 OFFSET 0;
```

Then join with `recipes` table for full recipe data.

### API Response

```json
{
  "items": [
    {
      "id": "abc-123",
      "title": "Lemon Garlic Chicken",
      "domain": "allrecipes.com",
      "image_url": "...",
      "total_time": 30,
      "match": {
        "have": 5,
        "total": 6,
        "missing": ["black pepper"]
      }
    }
  ],
  "has_more": true,
  "total_matches": 142083
}
```

### Autocomplete Endpoint

```
GET /api/v1/ingredients/suggest?q=chi&limit=10
```

Returns matching ingredients from the vocabulary:
```json
{
  "items": [
    { "name": "chicken", "count": 28403 },
    { "name": "chickpeas", "count": 4201 },
    { "name": "chili powder", "count": 12883 },
    { "name": "chives", "count": 3102 }
  ]
}
```

---

## Performance Considerations

- The `recipe_ingredients` table will have ~1.5M rows (155k recipes × ~10 ingredients each)
- Index on `ingredient` makes the `WHERE IN (...)` fast
- The CTE approach avoids scanning all recipes — starts from the ingredient index
- For large "have" lists (10+ ingredients), the query is still efficient because it intersects small-ish sets
- Consider caching popular ingredient combinations in KV

---

## Implementation Phases

### Phase A: Ingredient Index (backend)
1. Create `recipe_ingredients` and `ingredients` tables
2. Add ingredient extraction to the projection worker
3. Backfill existing recipes
4. Add `/api/v1/search/by-ingredients` endpoint
5. Add `/api/v1/ingredients/suggest` endpoint

### Phase B: Frontend
1. Ingredient board component (have/exclude with autocomplete)
2. Results view with match scores
3. Missing ingredient badges
4. Mobile version

---

## Open Questions

1. Should we handle ingredient synonyms? (e.g. "capsicum" = "bell pepper", "coriander" = "cilantro")
2. Should pantry staples (salt, pepper, oil, water) be excluded from match scoring? Most recipes need them and most kitchens have them.
3. Should we weight ingredients by importance? (protein > garnish)
