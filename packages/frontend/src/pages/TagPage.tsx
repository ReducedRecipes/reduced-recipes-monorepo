import { useParams } from "react-router-dom";
import { useRecipes } from "../hooks/useRecipes";
import RecipeGrid from "../components/RecipeGrid";

export default function TagPage() {
  const { tag } = useParams<{ tag: string }>();
  const params = tag ? { tag } : {};
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useRecipes(params);

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
      <RecipeGrid
        items={items}
        hasNextPage={hasNextPage ?? false}
        fetchNextPage={fetchNextPage}
        isFetchingNextPage={isFetchingNextPage}
        emptyMessage="No recipes found."
      />
    </div>
  );
}
