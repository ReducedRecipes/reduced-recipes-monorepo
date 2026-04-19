import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchShoppingLists,
  createShoppingList,
  getShoppingList,
  updateShoppingList,
  deleteShoppingList,
  addManualItem,
  updateItem,
  deleteItem,
  uncheckAll,
  createShareLink,
  revokeShareLink,
  renewShareLink,
} from "../lib/api";
import type {
  ShoppingListSummary,
  ShoppingListDetailResponse,
  ShareLinkResponse,
} from "../lib/api";
import { useAuth } from "./useAuth";
import type { ShoppingList, SmartRollupItem } from "@rr/shared";

export function useShoppingLists() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["shopping-lists"],
    queryFn: async () => {
      const res = await fetchShoppingLists();
      return res.items;
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
  });

  const lists = data ?? [];

  const createMutation = useMutation({
    mutationFn: (params: { name?: string }) => createShoppingList(params),
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ["shopping-lists"] });
      const previous = queryClient.getQueryData<ShoppingListSummary[]>(["shopping-lists"]);
      queryClient.setQueryData<ShoppingListSummary[]>(["shopping-lists"], (old) => [
        ...(old ?? []),
        {
          id: `temp-${Date.now()}`,
          user_id: "",
          collection_id: null,
          name: params.name ?? "My Shopping List",
          is_default: 0,
          share_token: null,
          share_expires_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          item_count: 0,
          recipe_count: 0,
        },
      ]);
      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["shopping-lists"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string }) =>
      updateShoppingList(id, data),
    onMutate: async ({ id, ...data }) => {
      await queryClient.cancelQueries({ queryKey: ["shopping-lists"] });
      const previous = queryClient.getQueryData<ShoppingListSummary[]>(["shopping-lists"]);
      queryClient.setQueryData<ShoppingListSummary[]>(["shopping-lists"], (old) =>
        (old ?? []).map((l) =>
          l.id === id ? { ...l, name: data.name, updated_at: new Date().toISOString() } : l,
        ),
      );
      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["shopping-lists"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteShoppingList(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["shopping-lists"] });
      const previous = queryClient.getQueryData<ShoppingListSummary[]>(["shopping-lists"]);
      queryClient.setQueryData<ShoppingListSummary[]>(["shopping-lists"], (old) =>
        (old ?? []).filter((l) => l.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["shopping-lists"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });

  return {
    lists,
    isLoading,
    createList: createMutation.mutate,
    createListAsync: createMutation.mutateAsync,
    updateList: updateMutation.mutate,
    deleteList: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useShoppingList(id: string | undefined) {
  const { isAuthenticated } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["shopping-lists", id],
    queryFn: () => getShoppingList(id!),
    enabled: isAuthenticated && !!id,
    staleTime: 2 * 60 * 1000,
  });

  return { list: data, isLoading };
}

export function useShoppingListItems(listId: string | undefined) {
  const queryClient = useQueryClient();

  const addItemMutation = useMutation({
    mutationFn: (data: { name: string; quantity?: number; unit?: string }) =>
      addManualItem(listId!, data),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", listId] });
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({
      itemId,
      ...data
    }: {
      itemId: string;
      checked?: number;
      quantity?: number;
      unit?: string;
      name?: string;
    }) => updateItem(listId!, itemId, data),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", listId] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", listId] });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => deleteItem(listId!, itemId),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", listId] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", listId] });
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });

  const uncheckAllMutation = useMutation({
    mutationFn: () => uncheckAll(listId!),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", listId] });
    },
  });

  return {
    addItem: addItemMutation.mutate,
    updateItem: updateItemMutation.mutate,
    deleteItem: deleteItemMutation.mutate,
    uncheckAll: uncheckAllMutation.mutate,
    isAdding: addItemMutation.isPending,
    isUpdating: updateItemMutation.isPending,
    isDeleting: deleteItemMutation.isPending,
  };
}

export function useShareLink(listId: string | undefined) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => createShareLink(listId!),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", listId] });
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeShareLink(listId!),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", listId] });
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });

  const renewMutation = useMutation({
    mutationFn: () => renewShareLink(listId!),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", listId] });
    },
  });

  return {
    createShareLink: createMutation.mutate,
    revokeShareLink: revokeMutation.mutate,
    renewShareLink: renewMutation.mutate,
    isCreating: createMutation.isPending,
    isRevoking: revokeMutation.isPending,
    isRenewing: renewMutation.isPending,
  };
}
