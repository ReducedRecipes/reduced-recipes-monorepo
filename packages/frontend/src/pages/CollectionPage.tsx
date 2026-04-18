import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { fetchCollectionBookmarks, apiFetch } from "../lib/api";
import type { Bookmark } from "@rr/shared";
import RecipeCard from "../components/RecipeCard";

interface Collection {
  id: string;
  name: string;
  is_default: number;
  is_public: number;
}

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data: collection } = useQuery({
    queryKey: ["collection", id],
    queryFn: () => apiFetch<Collection>(`/collections/${id}`),
    enabled: !!id && isAuthenticated,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["collection-bookmarks", id],
    queryFn: () => fetchCollectionBookmarks(id!),
    enabled: !!id && isAuthenticated,
  });

  const removeBookmark = useMutation({
    mutationFn: (bookmarkId: string) =>
      apiFetch(`/bookmarks/${bookmarkId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection-bookmarks", id] });
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  if (authLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    navigate("/", { replace: true });
    return null;
  }

  const bookmarks = data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link to="/saved" className="text-gray-400 hover:text-orange-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {collection?.name ?? "Collection"}
        </h1>
        <span className="text-sm text-gray-500">
          {bookmarks.length} recipe{bookmarks.length !== 1 ? "s" : ""}
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
        </div>
      ) : bookmarks.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500 mb-4">No recipes in this collection yet.</p>
          <Link to="/" className="text-orange-600 hover:underline">
            Browse recipes to add some
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {bookmarks.map((bookmark: Bookmark) => (
            <div key={bookmark.id} className="relative group">
              <Link to={`/recipe/${bookmark.recipe_id}`}>
                <div className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow">
                  <p className="font-medium text-gray-900 truncate">{bookmark.recipe_id}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Saved {new Date(bookmark.created_at).toLocaleDateString()}
                  </p>
                </div>
              </Link>
              <button
                onClick={() => {
                  setRemovingId(bookmark.id);
                  removeBookmark.mutate(bookmark.id, {
                    onSettled: () => setRemovingId(null),
                  });
                }}
                disabled={removingId === bookmark.id}
                className="absolute top-2 right-2 hidden group-hover:flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600 hover:bg-red-200 text-xs"
                title="Remove from collection"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
