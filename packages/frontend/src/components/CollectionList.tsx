import { useState } from "react";
import { Link } from "react-router-dom";
import { useCollections } from "../hooks/useCollections";
import type { Collection } from "@rr/shared";

export function CollectionList() {
  const {
    collections,
    isLoading,
    createCollection,
    updateCollection,
    deleteCollection,
  } = useCollections();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createCollection({ name: trimmed });
    setNewName("");
  };

  const startEdit = (collection: Collection) => {
    setEditingId(collection.id);
    setEditName(collection.name);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    updateCollection({ id: editingId, name: trimmed });
    setEditingId(null);
    setEditName("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const handleDelete = (id: string) => {
    deleteCollection(id);
    setDeleteConfirmId(null);
  };

  if (isLoading) {
    return (
      <div className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>
        Loading&hellip;
      </div>
    );
  }

  return (
    <div>
      {/* Create new collection */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Collection name"
          className="mono"
          style={{
            width: "100%",
            fontSize: 12,
            padding: "7px 8px",
            background: "transparent",
            border: "1px solid var(--rule-2)",
            color: "var(--ink)",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {newName.trim() && (
          <button
            type="button"
            onClick={handleCreate}
            className="mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginTop: 6,
              color: "var(--accent-ink)",
              background: "none",
              border: "none",
            }}
          >
            + Create "{newName.trim()}"
          </button>
        )}
      </div>

      {/* Collection list */}
      {collections.length === 0 ? (
        <div
          style={{
            padding: "20px 0",
            textAlign: "center",
            color: "var(--ink-3)",
            fontSize: 13,
          }}
        >
          No collections yet.
        </div>
      ) : (
        <div>
          {collections.map((collection) => (
            <div
              key={collection.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              {editingId === collection.id ? (
                <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 8 }}>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="mono"
                    style={{
                      flex: 1,
                      fontSize: 13,
                      padding: "4px 8px",
                      border: "1px solid var(--rule-2)",
                      background: "transparent",
                      color: "var(--ink)",
                      outline: "none",
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="mono"
                    style={{ fontSize: 11, color: "var(--accent-ink)" }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="mono"
                    style={{ fontSize: 11, color: "var(--ink-3)" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <Link
                    to={`/collection/${collection.id}`}
                    style={{ fontSize: 14, color: "var(--ink)" }}
                  >
                    {collection.name}
                    {collection.is_default === 1 && (
                      <span className="mono" style={{ marginLeft: 8, fontSize: 11, color: "var(--ink-3)" }}>
                        (default)
                      </span>
                    )}
                  </Link>
                  {collection.is_default !== 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {deleteConfirmId === collection.id ? (
                        <>
                          <span className="mono" style={{ fontSize: 11, color: "oklch(0.50 0.15 25)" }}>
                            Delete?
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDelete(collection.id)}
                            className="mono"
                            style={{ fontSize: 11, color: "oklch(0.50 0.15 25)" }}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="mono"
                            style={{ fontSize: 11, color: "var(--ink-3)" }}
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(collection)}
                            className="mono"
                            style={{ fontSize: 11, color: "var(--ink-3)" }}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(collection.id)}
                            className="mono"
                            style={{ fontSize: 11, color: "var(--ink-3)" }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
