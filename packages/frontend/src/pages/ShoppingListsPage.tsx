import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useShoppingLists } from "../hooks/useShoppingLists";

export default function ShoppingListsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { lists, isLoading, createListAsync, isCreating, deleteList } =
    useShoppingLists();
  const [newListName, setNewListName] = useState("");

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

  const handleCreate = async () => {
    const name = newListName.trim();
    try {
      const result = await createListAsync(name ? { name } : {});
      setNewListName("");
      if (result?.id) {
        navigate(`/shopping-lists/${result.id}`);
      }
    } catch {
      // mutation error handled by React Query
    }
  };

  const ownedLists = lists.filter((l) => l.role !== "member");
  const sharedLists = lists.filter((l) => l.role === "member");

  return (
    <div className="mx-auto max-w-3xl py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Shopping Lists</h1>

      {/* Create new list */}
      <div className="mb-6 flex gap-2">
        <input
          type="text"
          placeholder="New list name (optional)"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          onClick={handleCreate}
          disabled={isCreating}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {isCreating ? "Creating..." : "New List"}
        </button>
      </div>

      {/* Lists */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg bg-gray-200"
            />
          ))}
        </div>
      ) : ownedLists.length === 0 && sharedLists.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
          No shopping lists yet. Create one to get started.
        </p>
      ) : (
        <>
          {/* Owned lists */}
          {ownedLists.length > 0 && (
            <div className="space-y-3">
              {ownedLists.map((list) => (
                <div
                  key={list.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <Link
                    to={`/shopping-lists/${list.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {list.name}
                      </h3>
                      {(list.member_count ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                          </svg>
                          {list.member_count}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {list.item_count} {list.item_count === 1 ? "item" : "items"}
                      {list.recipe_count > 0 && (
                        <span>
                          {" "}
                          &middot; {list.recipe_count}{" "}
                          {list.recipe_count === 1 ? "recipe" : "recipes"}
                        </span>
                      )}
                    </p>
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm("Delete this shopping list?")) {
                        deleteList(list.id);
                      }
                    }}
                    className="ml-3 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    title="Delete list"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Shared lists */}
          {sharedLists.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-gray-700 mt-8 mb-3">
                Shared with me
              </h2>
              <div className="space-y-3">
                {sharedLists.map((list) => (
                  <div
                    key={list.id}
                    className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50/50 p-4 shadow-sm"
                  >
                    <Link
                      to={`/shared/lists/${list.share_token}`}
                      className="flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {list.name}
                        </h3>
                        <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 shrink-0">
                          Shared
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {list.owner_name && (
                          <span>by {list.owner_name} &middot; </span>
                        )}
                        {list.item_count} {list.item_count === 1 ? "item" : "items"}
                      </p>
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
