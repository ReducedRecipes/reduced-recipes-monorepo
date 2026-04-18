import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { useBookmarks } from "../hooks/useBookmarks";
import { CollectionList } from "../components/CollectionList";
import { fetchRecipe } from "../lib/api";
import { BookmarkButton } from "../components/BookmarkButton";
import { useEffect } from "react";

function BookmarkedRecipeCard({ recipeId }: { recipeId: string }) {
  const { data: recipe, isLoading } = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: () => fetchRecipe(recipeId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-lg bg-gray-200" />;
  }

  if (!recipe) return null;

  return (
    <div className="relative rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <Link to={`/recipe/${recipeId}`} className="flex gap-4 p-3">
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="h-20 w-20 flex-shrink-0 rounded object-cover"
          />
        ) : (
          <div className="h-20 w-20 flex-shrink-0 rounded bg-gray-200" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 line-clamp-2">
            {recipe.title}
          </h3>
          <p className="text-sm text-gray-500 mt-1">{recipe.domain}</p>
        </div>
      </Link>
      <div className="absolute top-2 right-2">
        <BookmarkButton recipeId={recipeId} compact />
      </div>
    </div>
  );
}

export default function SavedPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { bookmarks, isLoading: bookmarksLoading } = useBookmarks();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="mx-auto max-w-3xl py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Saved Recipes</h1>

      <div className="grid gap-8 md:grid-cols-[1fr,300px]">
        {/* Bookmarked recipes */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Bookmarks
          </h2>
          {bookmarksLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-lg bg-gray-200" />
              ))}
            </div>
          ) : bookmarks.length === 0 ? (
            <p className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
              No bookmarks yet. Browse recipes and tap the heart icon to save
              them here.
            </p>
          ) : (
            <div className="space-y-3">
              {bookmarks.map((bookmark) => (
                <BookmarkedRecipeCard
                  key={bookmark.id}
                  recipeId={bookmark.recipe_id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Collections sidebar */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Collections
          </h2>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <CollectionList />
          </div>
        </div>
      </div>
    </div>
  );
}
