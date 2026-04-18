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
      <div className="animate-pulse space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded bg-gray-200" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Create new collection */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="New collection name"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={!newName.trim()}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
        >
          Create
        </button>
      </div>

      {/* Collection list */}
      {collections.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">
          No collections yet. Create one above!
        </p>
      ) : (
        <ul className="space-y-1">
          {collections.map((collection) => (
            <li
              key={collection.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
            >
              {editingId === collection.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <Link
                    to={`/collection/${collection.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-orange-600"
                  >
                    {collection.name}
                    {collection.is_default === 1 && (
                      <span className="ml-2 text-xs text-gray-400">
                        (default)
                      </span>
                    )}
                  </Link>
                  {collection.is_default !== 1 && (
                    <div className="flex items-center gap-2">
                      {deleteConfirmId === collection.id ? (
                        <>
                          <span className="text-xs text-red-600">Delete?</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(collection.id)}
                            className="text-sm font-medium text-red-600 hover:text-red-700"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="text-sm text-gray-500 hover:text-gray-700"
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(collection)}
                            className="text-sm text-gray-500 hover:text-orange-600"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirmId(collection.id)
                            }
                            className="text-sm text-gray-500 hover:text-red-600"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
