import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { SmartRollupItem } from "@rr/shared";

interface SharedListResponse {
  id: string;
  name: string;
  items: {
    unchecked: SmartRollupItem[];
    checked: SmartRollupItem[];
  };
}

export default function SharedListPage() {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();

  const { data: list, isLoading, error } = useQuery({
    queryKey: ["shared-list", token],
    queryFn: () => apiFetch<SharedListResponse>(`/shared/lists/${token}`),
    enabled: !!token,
  });

  const toggleItem = useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: number }) =>
      apiFetch(`/shared/lists/${token}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked }),
      }),
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

  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{list.name}</h1>
      <p className="text-sm text-gray-500 mb-6">Shared shopping list</p>

      {unchecked.length === 0 && checked.length === 0 ? (
        <p className="text-gray-500 text-center py-8">This list is empty.</p>
      ) : (
        <>
          {unchecked.length > 0 && (
            <div className="space-y-1 mb-6">
              {unchecked.map((item) => (
                <button
                  key={item.canonical_item}
                  type="button"
                  onClick={() => {
                    for (const s of item.sources ?? []) {
                      toggleItem.mutate({ itemId: s.item_id, checked: 1 });
                    }
                  }}
                  className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="h-5 w-5 shrink-0 rounded" style={{ border: "2px solid var(--ink-2)" }} />
                  <span className="text-sm text-gray-900">{item.display_text}</span>
                </button>
              ))}
            </div>
          )}

          {checked.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                Checked off ({checked.length})
              </h3>
              <div className="space-y-1">
                {checked.map((item) => (
                  <button
                    key={item.canonical_item}
                    type="button"
                    onClick={() => {
                      for (const s of item.sources ?? []) {
                        toggleItem.mutate({ itemId: s.item_id, checked: 0 });
                      }
                    }}
                    className="flex w-full items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-left hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-orange-500 bg-orange-500">
                      <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-sm text-gray-400 line-through">{item.display_text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
