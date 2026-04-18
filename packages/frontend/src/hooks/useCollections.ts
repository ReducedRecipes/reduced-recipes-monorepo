import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCollections,
  createCollection,
  updateCollection,
  deleteCollection,
} from "../lib/api";
import { useAuth } from "./useAuth";
import type { Collection } from "@rr/shared";

export function useCollections() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["collections"],
    queryFn: async () => {
      const res = await fetchCollections();
      return res.items;
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
  });

  const collections = data ?? [];

  const createMutation = useMutation({
    mutationFn: (params: { name: string; is_public?: boolean }) =>
      createCollection(params),
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ["collections"] });
      const previous =
        queryClient.getQueryData<Collection[]>(["collections"]);
      queryClient.setQueryData<Collection[]>(["collections"], (old) => [
        ...(old ?? []),
        {
          id: `temp-${Date.now()}`,
          user_id: "",
          name: params.name,
          is_default: 0,
          is_public: params.is_public ? 1 : 0,
          position: (old ?? []).length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["collections"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      is_public?: boolean;
      position?: number;
    }) => updateCollection(id, data),
    onMutate: async ({ id, ...data }) => {
      await queryClient.cancelQueries({ queryKey: ["collections"] });
      const previous =
        queryClient.getQueryData<Collection[]>(["collections"]);
      queryClient.setQueryData<Collection[]>(["collections"], (old) =>
        (old ?? []).map((c) =>
          c.id === id
            ? {
                ...c,
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.is_public !== undefined
                  ? { is_public: data.is_public ? 1 : 0 }
                  : {}),
                ...(data.position !== undefined
                  ? { position: data.position }
                  : {}),
                updated_at: new Date().toISOString(),
              }
            : c,
        ),
      );
      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["collections"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCollection(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["collections"] });
      const previous =
        queryClient.getQueryData<Collection[]>(["collections"]);
      queryClient.setQueryData<Collection[]>(["collections"], (old) =>
        (old ?? []).filter((c) => c.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["collections"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  return {
    collections,
    isLoading,
    createCollection: createMutation.mutate,
    updateCollection: updateMutation.mutate,
    deleteCollection: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
