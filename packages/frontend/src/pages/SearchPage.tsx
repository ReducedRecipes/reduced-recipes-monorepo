import { useSearchParams } from "react-router-dom";
import { useSearch } from "../hooks/useSearch";
import RecipeCard from "../components/RecipeCard";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSearch(q);

  if (q.length < 2) {
    return (
      <div className="p-8 text-center text-gray-500">
        Enter at least 2 characters to search.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-500">Searching…</div>
    );
  }

  const recipes = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Search results for &lsquo;{q}&rsquo;
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
        <p className="text-gray-500">No results found.</p>
      )}
    </div>
  );
}
