import { useParams } from "react-router-dom";
import { useRecipes } from "../hooks/useRecipes";
import RecipeCard from "../components/RecipeCard";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function CuisinePage() {
  const { cuisine } = useParams<{ cuisine: string }>();
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useRecipes({ cuisine });

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return <p className="p-6 text-center text-gray-500">Loading…</p>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">{capitalize(cuisine!)} Cuisine Recipes</h1>

      {items.length === 0 ? (
        <p className="text-gray-500">No recipes found</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
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
