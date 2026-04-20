import type { RecipeSummary } from "@rr/shared/types";
import RecipeCard from "./RecipeCard";
import { Pill } from "./design-system";

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
        <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
          <Pill
            onClick={() => fetchNextPage()}
            style={{ opacity: isFetchingNextPage ? 0.5 : 1, pointerEvents: isFetchingNextPage ? "none" : undefined }}
          >
            {isFetchingNextPage ? "Loading..." : "Load More"}
          </Pill>
        </div>
      )}
    </div>
  );
}
