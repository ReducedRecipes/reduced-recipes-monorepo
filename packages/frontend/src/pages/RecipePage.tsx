import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useRecipe } from "../hooks/useRecipe";
import { useRecipes } from "../hooks/useRecipes";
import { useAuth } from "../hooks/useAuth";
import { useShoppingLists } from "../hooks/useShoppingLists";
import { BookmarkButton } from "../components/BookmarkButton";
import { addRecipeToList } from "../lib/api";
import { Rule, Pill, FoodPlaceholder } from "../components/design-system";
import { StatRail } from "../components/recipe/StatRail";
import { StickyControls } from "../components/recipe/StickyControls";
import { CookMode } from "../components/recipe/CookMode";
import { NutritionPanel } from "../components/recipe/NutritionPanel";
import { scaleIngredient, parseIngredient, formatQty } from "../lib/formatQty";
import { useSimilarRecipes } from "../hooks/useSimilarRecipes";
import type { RecipeDocument } from "@rr/shared/types";
import type { RecipeSummary } from "@rr/shared";

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}

function buildSchemaLd(recipe: RecipeDocument): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    image: recipe.image_url ?? undefined,
    author: recipe.author
      ? { "@type": "Person", name: recipe.author }
      : undefined,
    totalTime: recipe.total_time ? `PT${recipe.total_time}M` : undefined,
    recipeYield: recipe.yields ?? undefined,
    recipeIngredient: recipe.ingredients,
    recipeInstructions: recipe.instructions.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      text: step,
    })),
    recipeCategory: recipe.category ?? undefined,
    recipeCuisine: recipe.cuisine ?? undefined,
    keywords: recipe.keywords.join(", ") || undefined,
  });
}

function parseBaseServings(yields: string | null): number {
  if (!yields) return 4;
  const m = yields.match(/(\d+)/);
  return m ? parseInt(m[1]!) : 4;
}

function SimilarShelfCard({ r }: { r: RecipeSummary }) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <Link
      to={`/recipe/${r.id}`}
      style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160, maxWidth: 200, flexShrink: 0, textDecoration: "none", color: "inherit" }}
    >
      {r.image_url && !imgFailed ? (
        <img
          src={r.image_url}
          alt={r.title}
          onError={() => setImgFailed(true)}
          style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block", border: "1px solid var(--rule-2)" }}
        />
      ) : (
        <div style={{ aspectRatio: "1/1", background: "var(--bg-2)", border: "1px solid var(--rule-2)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <span className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", textAlign: "center", lineHeight: 1.2 }}>{r.title}</span>
        </div>
      )}
      <div>
        <div className="serif" style={{ fontSize: 14, lineHeight: 1.2, letterSpacing: "-0.01em", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.title}</div>
        {r.total_time && <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>{r.total_time}m</div>}
      </div>
    </Link>
  );
}

function RecipeImage({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="mb-8">
        <FoodPlaceholder label={title} ratio="16/9" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={title}
      loading="lazy"
      onError={() => setFailed(true)}
      className="mb-8 aspect-[16/9] w-full object-cover"
    />
  );
}

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const { data: recipe, isLoading, error } = useRecipe(id ?? "");
  const { data: vectorSimilar } = useSimilarRecipes(id ?? "");
  const { isAuthenticated } = useAuth();
  const { lists, createListAsync } = useShoppingLists();

  // Fall back to cuisine/tag-based similar recipes if vector search returns nothing
  const similarParams = recipe?.cuisine
    ? { cuisine: recipe.cuisine, limit: 7 }
    : recipe?.tags?.[0]
    ? { tag: recipe.tags[0], limit: 7 }
    : undefined;
  const { data: fallbackSimilar } = useRecipes(similarParams);

  const similarRecipes = (vectorSimilar?.items ?? []).length > 0
    ? (vectorSimilar?.items ?? []).filter((r: RecipeSummary) => r.id !== id).slice(0, 6)
    : (fallbackSimilar?.pages[0]?.items ?? []).filter((r) => r.id !== id).slice(0, 6);

  const baseServings = useMemo(
    () => parseBaseServings(recipe?.yields ?? null),
    [recipe?.yields],
  );
  const [servings, setServings] = useState(baseServings);
  const [unitSystem, setUnitSystem] = useState<"us" | "metric">("us");
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(
    new Set(),
  );
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [cookMode, setCookMode] = useState(false);
  const [showListPicker, setShowListPicker] = useState(false);
  const [addingToList, setAddingToList] = useState<string | null>(null);
  const [addedToList, setAddedToList] = useState<string | null>(null);
  useEffect(() => {
    setServings(baseServings);
  }, [baseServings]);

  const multiplier = baseServings > 0 ? servings / baseServings : 1;

  // SEO: document title + meta tags
  useEffect(() => {
    if (!recipe) return;

    document.title = `${recipe.title} - ReducedRecipes`;

    const description =
      recipe.ingredients.length > 0
        ? `Recipe for ${recipe.title} with ${recipe.ingredients.length} ingredients.`
        : recipe.instructions[0]?.slice(0, 160) ?? recipe.title;

    const metaTags: HTMLMetaElement[] = [];
    const linkTags: HTMLLinkElement[] = [];

    function addMeta(
      attr: "name" | "property",
      key: string,
      content: string,
    ) {
      const el = document.createElement("meta");
      el.setAttribute(attr, key);
      el.content = content;
      document.head.appendChild(el);
      metaTags.push(el);
    }

    addMeta("name", "description", description);
    addMeta("property", "og:title", recipe.title);
    addMeta("property", "og:description", description);
    addMeta("property", "og:type", "article");
    if (recipe.image_url) {
      addMeta("property", "og:image", recipe.image_url);
    }

    const canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.href = window.location.href;
    document.head.appendChild(canonical);
    linkTags.push(canonical);

    return () => {
      document.title = "ReducedRecipes";
      metaTags.forEach((el) => el.remove());
      linkTags.forEach((el) => el.remove());
    };
  }, [recipe]);

  // Schema.org LD+JSON
  useEffect(() => {
    if (!recipe) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = buildSchemaLd(recipe);
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [recipe]);

  function toggleIngredient(index: number) {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleStep(index: number) {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center text-red-600">
        Failed to load recipe. {(error as Error).message}
      </div>
    );
  }

  if (!recipe) return null;

  const tags = [
    recipe.cuisine,
    recipe.category,
    ...recipe.tags,
  ].filter(Boolean);

  return (
    <>
      {cookMode && (
        <CookMode
          steps={recipe.instructions}
          title={recipe.title}
          onExit={() => setCookMode(false)}
        />
      )}

      <article className="mx-auto max-w-5xl py-4">
        {/* ── 1. Spec-sheet header ── */}
        <div className="mb-2">
          <Link
            to="/"
            className="caps inline-flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink-2"
          >
            ← Back to index
          </Link>
        </div>

        <div className="mb-1 font-mono text-xs uppercase tracking-wider text-ink-3">
          Recipe #{recipe.id.slice(0, 8)}
        </div>

        <h1 className="font-serif text-4xl italic leading-tight text-ink sm:text-5xl lg:text-6xl">
          {recipe.title}
        </h1>

        {/* Summary */}
        {recipe.ingredients.length > 0 && (
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
            {recipe.ingredients.length} ingredients · {recipe.instructions.length}{" "}
            steps
            {recipe.total_time != null && ` · ${formatTime(recipe.total_time)}`}
          </p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Link
                key={tag}
                to={`/tag/${tag}`}
                className="border border-rule px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-ink-3 transition-colors hover:border-ink-3 hover:text-ink-2"
              >
                {tag}
              </Link>
            ))}
          </div>
        )}

        {/* Filed under info card */}
        <div className="mt-6 border border-rule bg-bg-2 px-5 py-4">
          <div className="caps mb-2 text-ink-3">Filed under</div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {recipe.author && (
              <div>
                <span className="text-ink-3">Author</span>{" "}
                <span className="text-ink">{recipe.author}</span>
              </div>
            )}
            {recipe.domain && (
              <div>
                <span className="text-ink-3">Source</span>{" "}
                <Link
                  to={`/site/${recipe.domain}`}
                  className="text-ink underline decoration-rule hover:decoration-ink"
                >
                  {recipe.domain}
                </Link>
              </div>
            )}
            {recipe.category && (
              <div>
                <span className="text-ink-3">Category</span>{" "}
                <span className="text-ink">{recipe.category}</span>
              </div>
            )}
            {recipe.cuisine && (
              <div>
                <span className="text-ink-3">Cuisine</span>{" "}
                <span className="text-ink">{recipe.cuisine}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── 2. Stat rail ── */}
        <div className="mt-6">
          <StatRail
            totalTime={recipe.total_time}
            prepTime={recipe.prep_time}
            cookTime={recipe.cook_time}
            yields={recipe.yields}
            ingredientCount={recipe.ingredients.length}
            stepCount={recipe.instructions.length}
          />
        </div>

        {/* ── 3. Sticky controls ── */}
        <StickyControls
          servings={servings}
          onServingsChange={setServings}
          unitSystem={unitSystem}
          onUnitToggle={() =>
            setUnitSystem((s) => (s === "us" ? "metric" : "us"))
          }
          onPrint={() => window.print()}
          onCookMode={() => setCookMode(true)}
          bookmarkSlot={<BookmarkButton recipeId={recipe.id} />}
        />

        {/* ── 4. Two-column body ── */}
        <div className="mt-8 grid gap-10 lg:grid-cols-[300px_1fr]">
          {/* Left sidebar: ingredients + equipment */}
          <div className="lg:sticky lg:top-[200px] lg:self-start">
            {recipe.ingredients.length > 0 && (
              <section>
                <Rule label="Ingredients" style={{ marginBottom: 12 }} />
                <ul className="space-y-2">
                  {recipe.ingredients.map((ingredient, i) => {
                    const scaled = scaleIngredient(ingredient, multiplier);
                    const checked = checkedIngredients.has(i);
                    return (
                      <li key={i} className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleIngredient(i)}
                          className="mt-1 h-3.5 w-3.5 rounded-none border-rule accent-accent"
                        />
                        <span
                          className={`text-sm leading-snug ${
                            checked
                              ? "text-ink-3 line-through"
                              : "text-ink"
                          }`}
                        >
                          {multiplier !== 1 ? scaled : ingredient}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {/* Shopping list integration */}
                {isAuthenticated && (
                  <div className="relative mt-5">
                    {addedToList ? (
                      <p className="font-mono text-xs text-accent-ink">
                        Added to list{" "}
                        <Link
                          to={`/shopping-lists/${addedToList}`}
                          className="underline"
                        >
                          View →
                        </Link>
                      </p>
                    ) : (
                      <Pill onClick={() => setShowListPicker((v) => !v)}>
                        + Shopping list
                      </Pill>
                    )}
                    {showListPicker && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowListPicker(false)}
                        />
                        <div className="absolute left-0 z-20 mt-2 w-56 border border-rule bg-bg shadow-lg">
                          <div className="border-b border-rule px-3 py-2">
                            <span className="caps text-ink-3">Choose a list</span>
                          </div>
                          <ul className="max-h-48 overflow-y-auto">
                            {lists.map((list) => (
                              <li key={list.id}>
                                <button
                                  type="button"
                                  disabled={addingToList === list.id}
                                  onClick={async () => {
                                    if (!recipe) return;
                                    setAddingToList(list.id);
                                    try {
                                      await addRecipeToList(list.id, {
                                        recipe_id: recipe.id,
                                        ingredients: recipe.ingredients,
                                      });
                                      setAddedToList(list.id);
                                      setShowListPicker(false);
                                    } catch {
                                      /* ignore */
                                    }
                                    setAddingToList(null);
                                  }}
                                  className="block w-full px-3 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-bg-2 disabled:opacity-50"
                                >
                                  {addingToList === list.id
                                    ? "Adding..."
                                    : list.name}
                                </button>
                              </li>
                            ))}
                            {lists.length === 0 && (
                              <li>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const result = await createListAsync({
                                      name: "My Shopping List",
                                    });
                                    if (result?.id && recipe) {
                                      setAddingToList(result.id);
                                      try {
                                        await addRecipeToList(result.id, {
                                          recipe_id: recipe.id,
                                          ingredients: recipe.ingredients,
                                        });
                                        setAddedToList(result.id);
                                        setShowListPicker(false);
                                      } catch {
                                        /* ignore */
                                      }
                                      setAddingToList(null);
                                    }
                                  }}
                                  className="block w-full px-3 py-2 text-left text-sm text-accent-ink transition-colors hover:bg-bg-2"
                                >
                                  + Create new list
                                </button>
                              </li>
                            )}
                          </ul>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Right: image + steps */}
          <div>
            {/* Hero image */}
            <RecipeImage url={recipe.image_url} title={recipe.title} />

            {/* Timeline + Steps */}
            {recipe.instructions.length > 0 && (
              <section>
                <Rule label="Method" style={{ marginBottom: 16 }} />
                <ol className="space-y-6">
                  {recipe.instructions.map((step, i) => {
                    const done = completedSteps.has(i);
                    return (
                      <li key={i} className="flex gap-4">
                        {/* Step number */}
                        <button
                          onClick={() => toggleStep(i)}
                          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center border font-mono text-xs transition-all ${
                            done
                              ? "border-accent bg-accent text-bg"
                              : "border-rule text-ink-3 hover:border-ink-3"
                          }`}
                        >
                          {done ? "✓" : String(i + 1).padStart(2, "0")}
                        </button>
                        <p
                          className={`text-[15px] leading-relaxed ${
                            done ? "text-ink-3 line-through" : "text-ink"
                          }`}
                        >
                          {step}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {/* ── 5. "Why this works" callout ── */}
            {recipe.reduction && (
              <div className="mt-10 border border-rule px-5 py-4">
                <div className="caps mb-2 text-accent-ink">Why this works</div>
                <p className="text-sm leading-relaxed text-ink-2">
                  We reduced {recipe.reduction.original_words.toLocaleString()}{" "}
                  words down to {recipe.reduction.recipe_words.toLocaleString()}{" "}
                  — removing {recipe.reduction.bloat_percent}% of bloat
                  {recipe.reduction.ads_detected > 0 &&
                    ` and bypassing ${recipe.reduction.ads_detected} ad scripts`}
                  . Just the recipe, nothing else.
                </p>
              </div>
            )}

            {/* ── 6. Nutrition panel ── */}
            <div className="mt-10">
              <NutritionPanel />
            </div>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-rule pt-6">
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-ink bg-ink px-5 py-2.5 font-mono text-xs uppercase tracking-wider text-bg transition-opacity hover:opacity-90"
          >
            View original on {recipe.domain}
          </a>
          <div className="flex-1" />
          <span className="font-mono text-xs text-ink-3">
            Indexed {new Date(recipe.extracted_at).toLocaleDateString()}
          </span>
        </div>

        {/* ── Similar recipes shelf ── */}
        {similarRecipes.length > 0 && (
          <section style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--rule)" }}>
            <div className="caps" style={{ color: "var(--accent-ink)", marginBottom: 6 }}>◆ More like this</div>
            <div className="serif" style={{ fontSize: 28, fontStyle: "italic", letterSpacing: "-0.015em", marginBottom: 20 }}>
              {recipe.cuisine ? `More ${recipe.cuisine} recipes` : `More ${recipe.tags[0]} recipes`}
            </div>
            <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8 }}>
              {similarRecipes.map((r) => (
                <SimilarShelfCard key={r.id} r={r} />
              ))}
            </div>
          </section>
        )}
      </article>

    </>
  );
}
