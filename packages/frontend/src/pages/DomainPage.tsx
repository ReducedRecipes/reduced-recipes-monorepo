import { useParams } from "react-router-dom";
import { useDomainRecipes } from "../hooks/useDomainRecipes";
import RecipeCard from "../components/RecipeCard";

export default function DomainPage() {
  const { domain } = useParams<{ domain: string }>();
  const { data, isLoading, error } = useDomainRecipes(domain ?? "");

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-500">Loading recipes…</div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        Failed to load recipes for this domain.
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Recipes from {domain}
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
    </div>
  );
}
