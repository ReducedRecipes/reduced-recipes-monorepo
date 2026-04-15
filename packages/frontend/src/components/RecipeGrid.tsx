import type { RecipeSummary } from "@rr/shared/types";
import RecipeCard from "./RecipeCard";

interface RecipeGridProps {
  items: RecipeSummary[];
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  emptyMessage?: string;
}

export default function RecipeGrid({
  items,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  emptyMessage = "No recipes found",
}: RecipeGridProps) {
  if (items.length === 0) {
    return <p className="text-center text-gray-500 py-12">{emptyMessage}</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
      {hasNextPage && (
        <div className="flex justify-center py-8">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isFetchingNextPage ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
