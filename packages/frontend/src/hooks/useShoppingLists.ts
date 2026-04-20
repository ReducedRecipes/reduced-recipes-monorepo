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
  joinSharedList,
  leaveSharedList,
  addSharedListItem,
  getSharedListMembership,
} from "../lib/api";
import type {
  ShoppingListSummary,
  ShoppingListDetailResponse,
  ShareLinkResponse,
  SharedListMembership,
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
    onMutate: async ({ itemId, checked }) => {
      if (checked === undefined) return;
      await queryClient.cancelQueries({ queryKey: ["shopping-lists", listId] });
      const prev = queryClient.getQueryData<ShoppingListDetailResponse>(["shopping-lists", listId]);
      if (prev) {
        const all = [...prev.items.unchecked, ...prev.items.checked];
        // Move the item's source between unchecked/checked
        const newUnchecked: SmartRollupItem[] = [];
        const newChecked: SmartRollupItem[] = [];
        for (const item of all) {
          const hasSource = item.sources?.some((s) => s.item_id === itemId);
          if (hasSource) {
            (checked ? newChecked : newUnchecked).push(item);
          } else {
            // Keep in original bucket
            if (prev.items.unchecked.includes(item)) newUnchecked.push(item);
            else newChecked.push(item);
          }
        }
        queryClient.setQueryData<ShoppingListDetailResponse>(["shopping-lists", listId], {
          ...prev,
          items: { unchecked: newUnchecked, checked: newChecked },
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["shopping-lists", listId], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists", listId] });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => deleteItem(listId!, itemId),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: ["shopping-lists", listId] });
      const prev = queryClient.getQueryData<ShoppingListDetailResponse>(["shopping-lists", listId]);
      if (prev) {
        const filterSources = (items: SmartRollupItem[]) =>
          items
            .map((item) => ({
              ...item,
              sources: item.sources?.filter((s) => s.item_id !== itemId),
            }))
            .filter((item) => (item.sources?.length ?? 0) > 0);
        queryClient.setQueryData<ShoppingListDetailResponse>(["shopping-lists", listId], {
          ...prev,
          items: {
            unchecked: filterSources(prev.items.unchecked),
            checked: filterSources(prev.items.checked),
          },
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["shopping-lists", listId], ctx.prev);
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

export function useSharedListMembership(token: string | undefined) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["shared-list-membership", token],
    queryFn: () => getSharedListMembership(token!),
    enabled: isAuthenticated && !!token,
    staleTime: 30 * 1000,
  });

  const joinMutation = useMutation({
    mutationFn: () => joinSharedList(token!),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-list-membership", token] });
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveSharedList(token!),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-list-membership", token] });
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });

  return {
    membership: data,
    isLoading,
    joinList: joinMutation.mutate,
    joinListAsync: joinMutation.mutateAsync,
    leaveList: leaveMutation.mutate,
    isJoining: joinMutation.isPending,
    isLeaving: leaveMutation.isPending,
  };
}

export function useSharedListItems(token: string | undefined) {
  const queryClient = useQueryClient();

  const addItemMutation = useMutation({
    mutationFn: (data: { name: string; quantity?: number; unit?: string }) =>
      addSharedListItem(token!, data),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-list", token] });
    },
  });

  return {
    addItem: addItemMutation.mutate,
    isAdding: addItemMutation.isPending,
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
