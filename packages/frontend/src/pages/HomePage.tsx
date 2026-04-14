import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchTags } from "../lib/api";
import type { RecipeListParams } from "../lib/api";
import { useRecipes } from "../hooks/useRecipes";
import RecipeCard from "../components/RecipeCard";
import FilterBar from "../components/FilterBar";

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tag = searchParams.get("tag") ?? undefined;
  const cuisine = searchParams.get("cuisine") ?? undefined;

  const { data: tags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: fetchTags,
  });

  const params: RecipeListParams = {};
  if (tag) params.tag = tag;
  if (cuisine) params.cuisine = cuisine;

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useRecipes(params);

  const recipes = data?.pages.flatMap((p) => p.items) ?? [];

  function handleFilterChange(filters: { tag?: string; cuisine?: string }) {
    const next = new URLSearchParams();
    if (filters.tag) next.set("tag", filters.tag);
    if (filters.cuisine) next.set("cuisine", filters.cuisine);
    setSearchParams(next);
  }

  return (
    <div className="space-y-6">
      <FilterBar
        tags={tags}
        {...(tag ? { activeTag: tag } : {})}
        {...(cuisine ? { activeCuisine: cuisine } : {})}
        onFilterChange={handleFilterChange}
      />

      {isLoading && (
        <div className="text-center py-12 text-gray-500">Loading recipes...</div>
      )}

      {!isLoading && recipes.length === 0 && (
        <div className="text-center py-12 text-gray-500">No recipes found</div>
      )}

      {recipes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      {hasNextPage && (
        <div className="text-center py-4">
          <button
            type="button"
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
