import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useRecipe } from "../hooks/useRecipe";

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const { data: recipe, isLoading, error } = useRecipe(id ?? "");
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(
    new Set(),
  );
  const [highlightedStep, setHighlightedStep] = useState<number | null>(null);

  useEffect(() => {
    if (recipe) {
      document.title = `${recipe.title} - ReducedRecipes`;
    }
    return () => {
      document.title = "ReducedRecipes";
    };
  }, [recipe]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-xl font-semibold text-gray-700">
          Recipe not found
        </h2>
        <p className="mt-2 text-gray-500">
          {error instanceof Error ? error.message : "Something went wrong."}
        </p>
        <Link to="/" className="mt-4 inline-block text-orange-600 hover:underline">
          Back to recipes
        </Link>
      </div>
    );
  }

  function toggleIngredient(index: number) {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const ldJson = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    image: recipe.image_url ?? undefined,
    author: recipe.author ? { "@type": "Person", name: recipe.author } : undefined,
    totalTime: recipe.total_time ? `PT${recipe.total_time}M` : undefined,
    prepTime: recipe.prep_time ? `PT${recipe.prep_time}M` : undefined,
    cookTime: recipe.cook_time ? `PT${recipe.cook_time}M` : undefined,
    recipeYield: recipe.yields ?? undefined,
    recipeIngredient: recipe.ingredients,
    recipeInstructions: recipe.instructions.map((step) => ({
      "@type": "HowToStep",
      text: step,
    })),
    recipeCategory: recipe.category ?? undefined,
    recipeCuisine: recipe.cuisine ?? undefined,
    keywords: recipe.keywords.length > 0 ? recipe.keywords.join(", ") : undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
      />

      <article className="mx-auto max-w-3xl">
        {/* Hero image */}
        {recipe.image_url && (
          <img
            src={recipe.image_url}
            alt={recipe.title}
            loading="lazy"
            className="aspect-video w-full rounded-lg object-cover"
          />
        )}

        {/* Title + metadata */}
        <h1 className="mt-4 text-3xl font-bold text-gray-900">
          {recipe.title}
        </h1>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          {recipe.author && <span>By {recipe.author}</span>}
          <span>
            From{" "}
            <Link
              to={`/site/${encodeURIComponent(recipe.domain)}`}
              className="text-orange-600 hover:underline"
            >
              {recipe.domain}
            </Link>
          </span>
          {recipe.total_time != null && (
            <span>{formatTime(recipe.total_time)}</span>
          )}
          {recipe.yields && <span>{recipe.yields}</span>}
        </div>

        {/* Tags */}
        {recipe.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {recipe.tags.map((tag) => (
              <Link
                key={tag}
                to={`/tag/${encodeURIComponent(tag)}`}
                className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200"
              >
                {tag}
              </Link>
            ))}
          </div>
        )}

        {/* Ingredients */}
        {recipe.ingredients.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-800">
              Ingredients
            </h2>
            <ul className="mt-3 space-y-2">
              {recipe.ingredients.map((ingredient, i) => (
                <li key={i} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checkedIngredients.has(i)}
                    onChange={() => toggleIngredient(i)}
                    className="mt-1 h-4 w-4 accent-orange-600"
                  />
                  <span
                    className={
                      checkedIngredients.has(i)
                        ? "text-gray-400 line-through"
                        : "text-gray-700"
                    }
                  >
                    {ingredient}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Instructions */}
        {recipe.instructions.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-800">
              Instructions
            </h2>
            <ol className="mt-3 space-y-4">
              {recipe.instructions.map((step, i) => (
                <li
                  key={i}
                  onClick={() =>
                    setHighlightedStep(highlightedStep === i ? null : i)
                  }
                  className={`cursor-pointer rounded-lg p-3 transition-colors ${
                    highlightedStep === i
                      ? "bg-orange-50 ring-1 ring-orange-300"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span className="mr-2 font-bold text-orange-600">
                    {i + 1}.
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* CTA + Print */}
        <div className="mt-8 flex items-center gap-4 print:hidden">
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noopener"
            className="rounded-lg bg-orange-600 px-6 py-3 font-medium text-white hover:bg-orange-700"
          >
            View Full Recipe on {recipe.domain}
          </a>
          <button
            onClick={() => window.print()}
            className="rounded-lg border border-gray-300 px-4 py-3 text-gray-600 hover:bg-gray-50"
          >
            Print
          </button>
        </div>
      </article>
    </>
  );
}
