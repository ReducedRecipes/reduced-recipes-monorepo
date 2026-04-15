import { useParams } from "react-router-dom";
import { useRecipes } from "../hooks/useRecipes";
import RecipeCard from "../components/RecipeCard";

export default function TagPage() {
  const { tag } = useParams<{ tag: string }>();
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useRecipes({ tag });

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-500">Loading recipes…</div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Recipes tagged &ldquo;{tag}&rdquo;
      </h1>

      {items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      ) : (
        <p className="text-gray-500">No recipes found.</p>
      )}

      {hasNextPage && (
        <div className="mt-6 text-center">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isFetchingNextPage ? "Loading…" : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
