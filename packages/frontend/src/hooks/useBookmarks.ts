import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBookmarks, createBookmark, deleteBookmark } from "../lib/api";
import { useAuth } from "./useAuth";
import type { Bookmark } from "@rr/shared";

export function useBookmarks() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["bookmarks"],
    queryFn: async () => {
      const res = await getBookmarks();
      return res.items;
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
  });

  const bookmarks = data ?? [];

  const addMutation = useMutation({
    mutationFn: (recipeId: string) => createBookmark(recipeId),
    onMutate: async (recipeId) => {
      await queryClient.cancelQueries({ queryKey: ["bookmarks"] });
      const previous = queryClient.getQueryData<Bookmark[]>(["bookmarks"]);
      queryClient.setQueryData<Bookmark[]>(["bookmarks"], (old) => [
        ...(old ?? []),
        {
          id: `temp-${recipeId}`,
          user_id: "",
          collection_id: "",
          recipe_id: recipeId,
          recipe_deleted_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
      return { previous };
    },
    onError: (_err, _recipeId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["bookmarks"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (bookmarkId: string) => deleteBookmark(bookmarkId),
    onMutate: async (bookmarkId) => {
      await queryClient.cancelQueries({ queryKey: ["bookmarks"] });
      const previous = queryClient.getQueryData<Bookmark[]>(["bookmarks"]);
      queryClient.setQueryData<Bookmark[]>(["bookmarks"], (old) =>
        (old ?? []).filter((b) => b.id !== bookmarkId),
      );
      return { previous };
    },
    onError: (_err, _bookmarkId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["bookmarks"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  const isBookmarked = (recipeId: string): boolean =>
    bookmarks.some((b) => b.recipe_id === recipeId);

  const getBookmarkByRecipeId = (recipeId: string): Bookmark | undefined =>
    bookmarks.find((b) => b.recipe_id === recipeId);

  const toggle = (recipeId: string) => {
    const existing = getBookmarkByRecipeId(recipeId);
    if (existing) {
      removeMutation.mutate(existing.id);
    } else {
      addMutation.mutate(recipeId);
    }
  };

  return { bookmarks, isBookmarked, toggle, isLoading };
}
