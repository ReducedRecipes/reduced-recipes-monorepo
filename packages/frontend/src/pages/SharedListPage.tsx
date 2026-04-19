import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { ShoppingListItem } from "@rr/shared";

interface SharedListResponse {
  id: string;
  name: string;
  items: {
    unchecked: ShoppingListItem[];
    checked: ShoppingListItem[];
  };
}

export default function SharedListPage() {
  const { token } = useParams<{ token: string }>();

  const { data: list, isLoading, error } = useQuery({
    queryKey: ["shared-list", token],
    queryFn: () => apiFetch<SharedListResponse>(`/shared/lists/${token}`),
    enabled: !!token,
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
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
                >
                  <div className="h-4 w-4 rounded border border-gray-300" />
                  <span className="text-sm text-gray-900">
                    {item.item
                      ? `${item.quantity ?? ""} ${item.unit ?? ""} ${item.item}`.trim()
                      : item.original_text}
                  </span>
                </div>
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
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                  >
                    <div className="h-4 w-4 rounded border border-gray-300 bg-orange-500" />
                    <span className="text-sm text-gray-400 line-through">
                      {item.item
                        ? `${item.quantity ?? ""} ${item.unit ?? ""} ${item.item}`.trim()
                        : item.original_text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
