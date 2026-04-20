import { useSearchParams } from "react-router-dom";
import { useSearch } from "../hooks/useSearch";
import { useRecipes } from "../hooks/useRecipes";
import RecipeCard from "../components/RecipeCard";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const isSearching = q.length >= 2;

  const {
    data: searchData,
    isLoading: searchLoading,
    hasNextPage: searchHasNext,
    fetchNextPage: searchFetchNext,
    isFetchingNextPage: searchFetchingNext,
  } = useSearch(isSearching ? q : "");

  const {
    data: browseData,
    isLoading: browseLoading,
    hasNextPage: browseHasNext,
    fetchNextPage: browseFetchNext,
    isFetchingNextPage: browseFetchingNext,
  } = useRecipes({ limit: 24 });

  const data = isSearching ? searchData : browseData;
  const isLoading = isSearching ? searchLoading : browseLoading;
  const hasNextPage = isSearching ? searchHasNext : browseHasNext;
  const fetchNextPage = isSearching ? searchFetchNext : browseFetchNext;
  const isFetchingNextPage = isSearching ? searchFetchingNext : browseFetchingNext;

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-500">
        {isSearching ? "Searching…" : "Loading recipes…"}
      </div>
    );
  }

  const recipes = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        {isSearching
          ? <>Search results for &lsquo;{q}&rsquo;</>
          : "Browse recipes"}
      </h1>

      {recipes.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {recipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
          {hasNextPage && (
            <div className="mt-8 text-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="rounded-lg bg-orange-600 px-6 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {isFetchingNextPage ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="text-gray-500">
          {isSearching ? "No results found." : "No recipes available."}
        </p>
      )}
    </div>
  );
}
