import { useParams } from "react-router-dom";
import { useRecipes } from "../hooks/useRecipes";
import RecipeGrid from "../components/RecipeGrid";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function CuisinePage() {
  const { cuisine } = useParams<{ cuisine: string }>();
  const params = cuisine ? { cuisine } : {};
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useRecipes(params);

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return <p className="p-6 text-center text-gray-500">Loading…</p>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">{capitalize(cuisine ?? "")} Cuisine Recipes</h1>
      <RecipeGrid
        items={items}
        hasNextPage={hasNextPage ?? false}
        fetchNextPage={fetchNextPage}
        isFetchingNextPage={isFetchingNextPage}
      />
    </div>
  );
}
