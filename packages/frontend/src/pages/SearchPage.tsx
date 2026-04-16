import { useSearchParams } from "react-router-dom";
import { useSearch } from "../hooks/useSearch";
import RecipeCard from "../components/RecipeCard";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const { data, isLoading } = useSearch(q);

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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Search results for &lsquo;{q}&rsquo;
      </h1>

      {data && data.items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.items.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      ) : (
        <p className="text-gray-500">No results found.</p>
      )}
    </div>
  );
}
