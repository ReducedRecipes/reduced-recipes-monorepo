import { useRecipes } from "../hooks/useRecipes";
import RecipeGrid from "../components/RecipeGrid";

export default function HomePage() {
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useRecipes();

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <RecipeGrid
      items={items}
      hasNextPage={hasNextPage ?? false}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
    />
  );
}
