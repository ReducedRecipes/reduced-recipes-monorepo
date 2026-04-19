import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useRecipe } from "../hooks/useRecipe";
import { useAuth } from "../hooks/useAuth";
import { useShoppingLists } from "../hooks/useShoppingLists";
import { BookmarkButton } from "../components/BookmarkButton";
import { addRecipeToList } from "../lib/api";
import type { RecipeDocument } from "@rr/shared/types";

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
    author: recipe.author ? { "@type": "Person", name: recipe.author } : undefined,
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

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const { data: recipe, isLoading, error } = useRecipe(id ?? "");

  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [highlightedStep, setHighlightedStep] = useState<number | null>(null);
  const { isAuthenticated } = useAuth();
  const { lists, createListAsync } = useShoppingLists();
  const [showListPicker, setShowListPicker] = useState(false);
  const [addingToList, setAddingToList] = useState<string | null>(null);
  const [addedToList, setAddedToList] = useState<string | null>(null);

  useEffect(() => {
    if (!recipe) return;

    document.title = `${recipe.title} - ReducedRecipes`;

    const description = recipe.ingredients.length > 0
      ? `Recipe for ${recipe.title} with ${recipe.ingredients.length} ingredients.`
      : recipe.instructions[0]?.slice(0, 160) ?? recipe.title;

    const metaTags: HTMLMetaElement[] = [];
    const linkTags: HTMLLinkElement[] = [];

    function addMeta(attr: "name" | "property", key: string, content: string) {
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
    setHighlightedStep((prev) => (prev === index ? null : index));
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
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

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      {/* Hero image */}
      {recipe.image_url ? (
        <img
          src={recipe.image_url}
          alt={recipe.title}
          loading="lazy"
          className="aspect-[16/9] w-full rounded-lg object-cover"
        />
      ) : (
        <div className="aspect-[16/9] w-full rounded-lg bg-gray-200" />
      )}

      {/* Title + Bookmark */}
      <div className="mt-6 flex items-start justify-between gap-4">
        <h1 className="text-3xl font-bold">{recipe.title}</h1>
        <BookmarkButton recipeId={recipe.id} />
      </div>

      {/* Metadata */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
        {recipe.author && <span>By {recipe.author}</span>}
        {recipe.domain && (
          <Link to={`/site/${recipe.domain}`} className="underline hover:text-amber-600">
            {recipe.domain}
          </Link>
        )}
        {recipe.total_time != null && <span>{formatTime(recipe.total_time)}</span>}
        {recipe.yields && <span>{recipe.yields}</span>}
      </div>

      {/* Ingredients */}
      {recipe.ingredients.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Ingredients</h2>
          <ul className="mt-3 space-y-2">
            {recipe.ingredients.map((ingredient, i) => (
              <li key={i} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={checkedIngredients.has(i)}
                  onChange={() => toggleIngredient(i)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 accent-amber-500"
                />
                <span className={checkedIngredients.has(i) ? "text-gray-400 line-through" : ""}>
                  {ingredient}
                </span>
              </li>
            ))}
          </ul>

          {/* Add to Shopping List */}
          {isAuthenticated && (
            <div className="relative mt-4">
              {addedToList ? (
                <p className="text-sm text-green-600 font-medium">
                  Added to shopping list!{" "}
                  <Link to={`/shopping-lists/${addedToList}`} className="underline">
                    View list
                  </Link>
                </p>
              ) : (
                <button
                  onClick={() => setShowListPicker((v) => !v)}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                >
                  Add to Shopping List
                </button>
              )}
              {showListPicker && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowListPicker(false)} />
                  <div className="absolute left-0 z-20 mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-lg">
                    <div className="border-b border-gray-100 px-4 py-2">
                      <span className="text-sm font-semibold text-gray-800">Choose a list</span>
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
                              } catch { /* ignore */ }
                              setAddingToList(null);
                            }}
                            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                          >
                            {addingToList === list.id ? "Adding..." : list.name}
                          </button>
                        </li>
                      ))}
                      {lists.length === 0 && (
                        <li>
                          <button
                            type="button"
                            onClick={async () => {
                              const result = await createListAsync({ name: "My Shopping List" });
                              if (result?.id && recipe) {
                                setAddingToList(result.id);
                                try {
                                  await addRecipeToList(result.id, {
                                    recipe_id: recipe.id,
                                    ingredients: recipe.ingredients,
                                  });
                                  setAddedToList(result.id);
                                  setShowListPicker(false);
                                } catch { /* ignore */ }
                                setAddingToList(null);
                              }
                            }}
                            className="block w-full px-4 py-2 text-left text-sm text-orange-600 hover:bg-gray-100"
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

      {/* Instructions */}
      {recipe.instructions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Instructions</h2>
          <ol className="mt-3 list-decimal space-y-3 pl-6">
            {recipe.instructions.map((step, i) => (
              <li
                key={i}
                onClick={() => toggleStep(i)}
                className={`cursor-pointer rounded px-2 py-1 ${highlightedStep === i ? "bg-amber-100" : ""}`}
              >
                {step}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Tags */}
      {recipe.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {recipe.tags.map((tag) => (
            <Link
              key={tag}
              to={`/tag/${tag}`}
              className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-amber-100"
            >
              {tag}
            </Link>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href={recipe.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-amber-500 px-5 py-2.5 font-medium text-white hover:bg-amber-600"
        >
          View Full Recipe on {recipe.domain}
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50 print:hidden"
        >
          Print
        </button>
      </div>
    </article>
  );
}
