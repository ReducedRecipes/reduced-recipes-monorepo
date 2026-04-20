import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useShoppingLists } from "../hooks/useShoppingLists";
import { Rule } from "../components/design-system";

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
      <div className="flex justify-center py-20">
        <div className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>
          Loading&hellip;
        </div>
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
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 0" }}>
      <div className="caps" style={{ color: "var(--accent-ink)", marginBottom: 16 }}>
        ◆ Shopping Lists
      </div>
      <h1 className="serif" style={{ fontSize: 40, margin: "0 0 32px", lineHeight: 1 }}>
        Your Lists
      </h1>

      {/* Create new list */}
      <div style={{ display: "flex", gap: 10, marginBottom: 32 }}>
        <input
          type="text"
          placeholder="New list name (optional)"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="mono"
          style={{
            flex: 1,
            fontSize: 13,
            padding: "12px 14px",
            background: "var(--bg-2)",
            border: "1px solid var(--rule-2)",
            color: "var(--ink)",
            outline: "none",
          }}
        />
        <button
          onClick={handleCreate}
          disabled={isCreating}
          className="mono"
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            padding: "12px 20px",
            background: "var(--ink)",
            color: "var(--bg)",
            border: "1px solid var(--ink)",
            opacity: isCreating ? 0.5 : 1,
            cursor: isCreating ? "not-allowed" : "pointer",
          }}
        >
          {isCreating ? "Creating..." : "New List"}
        </button>
      </div>

      {/* Lists */}
      {isLoading ? (
        <div className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>
          Loading lists&hellip;
        </div>
      ) : ownedLists.length === 0 && sharedLists.length === 0 ? (
        <div
          style={{
            padding: "40px 0",
            textAlign: "center",
            color: "var(--ink-3)",
            fontSize: 14,
            borderTop: "1px solid var(--rule)",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          No shopping lists yet. Create one to get started.
        </div>
      ) : (
        <>
          {/* Owned lists */}
          {ownedLists.length > 0 && (
            <div>
              {ownedLists.map((list, i) => (
                <div
                  key={list.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 0",
                    borderBottom: i < ownedLists.length - 1 ? "1px solid var(--rule)" : undefined,
                  }}
                >
                  <Link
                    to={`/shopping-lists/${list.id}`}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>
                        {list.name}
                      </span>
                      {(list.member_count ?? 0) > 0 && (
                        <span className="mono" style={{ fontSize: 11, color: "var(--accent-ink)" }}>
                          {list.member_count} shared
                        </span>
                      )}
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>
                      {list.item_count} {list.item_count === 1 ? "item" : "items"}
                      {list.recipe_count > 0 && (
                        <span>
                          {" · "}{list.recipe_count}{" "}
                          {list.recipe_count === 1 ? "recipe" : "recipes"}
                        </span>
                      )}
                    </div>
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm("Delete this shopping list?")) {
                        deleteList(list.id);
                      }
                    }}
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: "var(--ink-3)",
                      marginLeft: 12,
                      padding: "6px 10px",
                      border: "1px solid var(--rule)",
                      background: "transparent",
                    }}
                    title="Delete list"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Shared lists */}
          {sharedLists.length > 0 && (
            <>
              <Rule style={{ marginTop: 32 }} />
              <div className="caps" style={{ color: "var(--ink-3)", margin: "24px 0 16px" }}>
                Shared with me
              </div>
              <div>
                {sharedLists.map((list, i) => (
                  <div
                    key={list.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "16px 0",
                      borderBottom: i < sharedLists.length - 1 ? "1px solid var(--rule)" : undefined,
                    }}
                  >
                    <Link
                      to={`/shared/lists/${list.share_token}`}
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>
                          {list.name}
                        </span>
                        <span className="caps" style={{ color: "var(--accent-ink)" }}>
                          Shared
                        </span>
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>
                        {list.owner_name && <span>by {list.owner_name} · </span>}
                        {list.item_count} {list.item_count === 1 ? "item" : "items"}
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
