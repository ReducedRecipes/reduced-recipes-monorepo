import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import {
  useSharedListMembership,
  useSharedListItems,
} from "../hooks/useShoppingLists";
import { useShoppingListSocket } from "../hooks/useShoppingListSocket";
import type { SmartRollupItem } from "@rr/shared";

interface SharedListResponse {
  id: string;
  name: string;
  user_id: string;
  member_count?: number;
  owner_name?: string | null;
  items: {
    unchecked: SmartRollupItem[];
    checked: SmartRollupItem[];
  };
}

function SharedAisleSection({
  category,
  items,
  token,
  toggleItem,
  queryClient,
}: {
  category: string;
  items: SmartRollupItem[];
  token: string;
  toggleItem: { mutate: (args: { itemId: string; checked: number }) => void };
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">{category}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{items.length}</span>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </button>
      {!collapsed && (
        <div className="divide-y divide-gray-100 px-4">
          {items.map((item) => (
            <div key={item.canonical_item} className="flex items-center gap-3 py-3 group">
              <button
                type="button"
                onClick={() => {
                  for (const s of item.sources ?? []) {
                    toggleItem.mutate({ itemId: s.item_id, checked: 1 });
                  }
                }}
                className="h-5 w-5 shrink-0 rounded"
                style={{ border: "2px solid #555" }}
              />
              <span className="flex-1 text-sm text-gray-900">{item.display_text}</span>
              <button
                type="button"
                onClick={() => {
                  for (const s of item.sources ?? []) {
                    apiFetch(`/shared/lists/${token}/items/${s.item_id}`, { method: "DELETE" }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ["shared-list", token] });
                    });
                  }
                }}
                className="opacity-0 group-hover:opacity-100 rounded p-1 text-gray-400 hover:text-red-500 transition-opacity"
                title="Remove item"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SharedListPage() {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const { data: list, isLoading, error } = useQuery({
    queryKey: ["shared-list", token],
    queryFn: () => apiFetch<SharedListResponse>(`/shared/lists/${token}`),
    enabled: !!token,
  });

  // Connect via WebSocket for real-time updates using the share token
  const socketOpts = token
    ? { shareToken: token, enabled: !!list?.id }
    : { enabled: false };
  const { isConnected, items: socketItems } = useShoppingListSocket(
    list?.id,
    socketOpts,
  );

  // When socket receives updates, refetch the rolled-up view
  useEffect(() => {
    if (isConnected && socketItems.length > 0) {
      queryClient.invalidateQueries({ queryKey: ["shared-list", token] });
    }
  }, [socketItems, isConnected, queryClient, token]);

  const { membership, joinList, leaveList, isJoining, isLeaving } =
    useSharedListMembership(token);

  const { addItem, isAdding } = useSharedListItems(token);
  const [newItemName, setNewItemName] = useState("");

  const toggleItem = useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: number }) =>
      apiFetch(`/shared/lists/${token}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked }),
      }),
    onMutate: async ({ itemId, checked }) => {
      await queryClient.cancelQueries({ queryKey: ["shared-list", token] });
      const prev = queryClient.getQueryData<SharedListResponse>(["shared-list", token]);
      if (prev) {
        const all = [...(prev.items?.unchecked ?? []), ...(prev.items?.checked ?? [])];
        const newUnchecked: SmartRollupItem[] = [];
        const newChecked: SmartRollupItem[] = [];
        for (const item of all) {
          const hasSource = item.sources?.some((s) => s.item_id === itemId);
          if (hasSource) {
            (checked ? newChecked : newUnchecked).push(item);
          } else {
            if (prev.items.unchecked.includes(item)) newUnchecked.push(item);
            else newChecked.push(item);
          }
        }
        queryClient.setQueryData<SharedListResponse>(["shared-list", token], {
          ...prev,
          items: { unchecked: newUnchecked, checked: newChecked },
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["shared-list", token], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-list", token] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-xl font-bold text-gray-900">List not found</h1>
        <p className="mt-2 text-gray-500">
          This shared list doesn't exist or the link has expired.
        </p>
      </div>
    );
  }

  const unchecked = list.items?.unchecked ?? [];
  const checked = list.items?.checked ?? [];

  const AISLE_ORDER = [
    'Produce', 'Dairy & Eggs', 'Meat & Seafood', 'Bakery',
    'Pantry', 'Spices & Seasonings', 'Oils & Vinegars',
    'Condiments & Sauces', 'Beverages', 'Frozen', 'Other',
  ];
  const uncheckedByAisle = (() => {
    const groups = new Map<string, SmartRollupItem[]>();
    for (const item of unchecked) {
      const cat = item.category || 'Other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    const result: { category: string; items: SmartRollupItem[] }[] = [];
    for (const cat of AISLE_ORDER) {
      const items = groups.get(cat);
      if (items && items.length > 0) result.push({ category: cat, items });
    }
    for (const [cat, items] of groups) {
      if (!AISLE_ORDER.includes(cat) && items.length > 0) {
        result.push({ category: cat, items });
      }
    }
    return result;
  })();

  const handleAddItem = () => {
    const name = newItemName.trim();
    if (!name) return;
    addItem({ name });
    setNewItemName("");
  };

  const canAddItems =
    membership?.is_owner || membership?.is_member || !isAuthenticated;

  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{list.name}</h1>
      <div className="flex items-center gap-2 mb-4">
        <p className="text-sm text-gray-500">
          Shared shopping list
          {list.owner_name && (
            <span> by {list.owner_name}</span>
          )}
          {isConnected && (
            <span title="Real-time sync active"> · Live</span>
          )}
        </p>
        {(list.member_count ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
            {list.member_count} {list.member_count === 1 ? "member" : "members"}
          </span>
        )}
      </div>

      {/* Membership actions */}
      {isAuthenticated && !membership?.is_owner && (
        <div className="mb-6">
          {membership?.is_member ? (
            <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <span className="text-sm text-green-800">You're a member of this list</span>
              <button
                onClick={() => {
                  if (confirm("Leave this shared list?")) {
                    leaveList();
                  }
                }}
                disabled={isLeaving}
                className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {isLeaving ? "Leaving..." : "Leave"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => joinList()}
              disabled={isJoining}
              className="w-full rounded-lg bg-orange-500 px-4 py-3 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {isJoining ? "Joining..." : "Add to my shopping lists"}
            </button>
          )}
        </div>
      )}

      {/* Items list */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {unchecked.length === 0 && checked.length === 0 ? (
          <p className="text-gray-500 text-center py-8 text-sm">This list is empty.</p>
        ) : (
          <>
            {uncheckedByAisle.map(({ category, items: aisleItems }) => (
              <SharedAisleSection
                key={category}
                category={category}
                items={aisleItems}
                token={token!}
                toggleItem={toggleItem}
                queryClient={queryClient}
              />
            ))}
          </>
        )}

        {/* Add item input */}
        {canAddItems && (
          <div className="border-t border-gray-200 px-4 py-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add an item..."
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <button
                onClick={handleAddItem}
                disabled={isAdding || !newItemName.trim()}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Checked items */}
        {checked.length > 0 && (
          <div className="border-t border-gray-200">
            <div className="px-4 py-2 bg-gray-50">
              <span className="text-sm font-medium text-gray-500">
                Checked off ({checked.length})
              </span>
            </div>
            <div className="divide-y divide-gray-100 px-4">
              {checked.map((item) => (
                <div key={item.canonical_item} className="flex items-center gap-3 py-3 group">
                  <button
                    type="button"
                    onClick={() => {
                      for (const s of item.sources ?? []) {
                        toggleItem.mutate({ itemId: s.item_id, checked: 0 });
                      }
                    }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                    style={{ border: "2px solid #E85D26", background: "#E85D26" }}
                  >
                    <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <span className="flex-1 text-sm text-gray-400 line-through">{item.display_text}</span>
                  <button
                    type="button"
                    onClick={() => {
                      for (const s of item.sources ?? []) {
                        apiFetch(`/shared/lists/${token}/items/${s.item_id}`, { method: "DELETE" }).then(() => {
                          queryClient.invalidateQueries({ queryKey: ["shared-list", token] });
                        });
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 rounded p-1 text-gray-400 hover:text-red-500 transition-opacity"
                    title="Remove item"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
