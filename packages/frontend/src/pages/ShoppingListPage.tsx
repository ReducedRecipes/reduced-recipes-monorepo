import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  useShoppingList,
  useShoppingListItems,
  useShareLink,
  useShoppingLists,
} from "../hooks/useShoppingLists";
import type { SmartRollupItem } from "@rr/shared";

const CATEGORY_ORDER = [
  "Produce",
  "Dairy",
  "Meat & Seafood",
  "Pantry",
  "Frozen",
  "Bakery",
  "Beverages",
  "Spices & Seasonings",
  "Other",
] as const;

function groupByCategory(
  items: SmartRollupItem[],
): { category: string; items: SmartRollupItem[] }[] {
  const groups = new Map<string, SmartRollupItem[]>();
  for (const item of items) {
    const cat = item.category || "Other";
    const list = groups.get(cat);
    if (list) list.push(item);
    else groups.set(cat, [item]);
  }
  const result: { category: string; items: SmartRollupItem[] }[] = [];
  for (const cat of CATEGORY_ORDER) {
    const catItems = groups.get(cat);
    if (catItems && catItems.length > 0) {
      result.push({ category: cat, items: catItems });
      groups.delete(cat);
    }
  }
  // Any remaining categories not in CATEGORY_ORDER
  for (const [cat, catItems] of groups) {
    if (catItems.length > 0) {
      result.push({ category: cat, items: catItems });
    }
  }
  return result;
}

function CategorySection({
  category,
  items,
  onToggle,
  onDelete,
}: {
  category: string;
  items: SmartRollupItem[];
  onToggle: (item: SmartRollupItem) => void;
  onDelete: (item: SmartRollupItem) => void;
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
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>
      {!collapsed && (
        <div className="divide-y divide-gray-100 px-4">
          {items.map((item) => (
            <RollupItemRow
              key={item.canonical_item}
              item={item}
              onToggle={() => onToggle(item)}
              onDelete={() => onDelete(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RollupItemRow({
  item,
  onToggle,
  onDelete,
  isChecked = false,
}: {
  item: SmartRollupItem;
  onToggle: () => void;
  onDelete: () => void;
  isChecked?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const uniqueRecipeIds = new Set(
    item.sources.filter((s) => s.recipe_id).map((s) => s.recipe_id),
  );
  const recipeCount = uniqueRecipeIds.size;
  const hasMultipleSources = recipeCount >= 2;
  const singleSource =
    recipeCount === 1
      ? item.sources.find((s) => s.recipe_id)
      : null;

  return (
    <div className="py-2 group">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
            isChecked
              ? "border-orange-500 bg-orange-500 text-white"
              : "border-gray-300 hover:border-orange-400"
          }`}
        >
          {isChecked && (
            <svg
              className="h-3 w-3"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 6l3 3 5-5" />
            </svg>
          )}
        </button>
        <div
          className={`flex-1 min-w-0 ${hasMultipleSources ? "cursor-pointer" : ""}`}
          onClick={hasMultipleSources ? () => setExpanded(!expanded) : undefined}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm ${
                isChecked ? "text-gray-400 line-through" : "text-gray-900"
              }`}
            >
              {item.display_text}
            </span>
            {hasMultipleSources && (
              <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                from {recipeCount} recipes
              </span>
            )}
            {singleSource && singleSource.recipe_id && (
              <Link
                to={`/recipe/${singleSource.recipe_id}`}
                className="text-xs text-orange-600 hover:text-orange-800 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                View recipe
              </Link>
            )}
          </div>
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 rounded p-1 text-gray-400 hover:text-red-500 transition-opacity"
          title="Remove item"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      {hasMultipleSources && expanded && (
        <div className="ml-8 mt-1 space-y-1 border-l-2 border-orange-200 pl-3">
          {item.sources
            .filter((s) => s.recipe_id)
            .map((source) => (
              <div
                key={source.item_id}
                className="flex items-center gap-2 text-xs text-gray-600"
              >
                <span className="truncate">
                  {source.original_text || item.canonical_item}
                  {source.quantity != null && ` (${source.quantity}${item.unit ? ` ${item.unit}` : ""})`}
                </span>
                <Link
                  to={`/recipe/${source.recipe_id}`}
                  className="flex-shrink-0 text-orange-600 hover:text-orange-800 hover:underline"
                >
                  View recipe
                </Link>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default function ShoppingListPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { list, isLoading } = useShoppingList(id);
  const { addItem, updateItem, deleteItem, uncheckAll, isAdding } =
    useShoppingListItems(id);
  const { updateList, deleteList } = useShoppingLists();
  const { createShareLink, revokeShareLink, isCreating: isCreatingShare } =
    useShareLink(id);

  const [newItemName, setNewItemName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  if (authLoading || isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !list) return null;

  const handleAddItem = () => {
    const name = newItemName.trim();
    if (!name) return;
    addItem({ name });
    setNewItemName("");
  };

  const handleSaveName = () => {
    const name = editedName.trim();
    if (name && name !== list.name) {
      updateList({ id: list.id, name });
    }
    setIsEditingName(false);
  };

  const handleDelete = () => {
    if (confirm("Delete this shopping list? This cannot be undone.")) {
      deleteList(list.id);
      navigate("/shopping-lists", { replace: true });
    }
  };

  const handleCopyShareLink = async () => {
    if (list.share_token) {
      const url = `${window.location.origin}/shared/lists/${list.share_token}`;
      await navigator.clipboard.writeText(url);
      alert("Share link copied to clipboard!");
    } else {
      createShareLink();
      alert("Creating share link...");
    }
  };

  const handleToggleItem = (item: SmartRollupItem) => {
    // Toggle all source items for this rolled-up item
    const newChecked = item.sources.length > 0 ? 1 : 0;
    for (const source of item.sources) {
      updateItem({ itemId: source.item_id, checked: newChecked });
    }
  };

  const handleUncheckItem = (item: SmartRollupItem) => {
    for (const source of item.sources) {
      updateItem({ itemId: source.item_id, checked: 0 });
    }
  };

  const handleDeleteItem = (item: SmartRollupItem) => {
    for (const source of item.sources) {
      deleteItem(source.item_id);
    }
  };

  const uncheckedItems = list.items.unchecked;
  const checkedItems = list.items.checked;
  const categoryGroups = groupByCategory(uncheckedItems);

  return (
    <div className="mx-auto max-w-2xl py-8">
      {/* Back link */}
      <button
        onClick={() => navigate("/shopping-lists")}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-orange-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
            clipRule="evenodd"
          />
        </svg>
        All Lists
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") setIsEditingName(false);
              }}
              className="w-full text-2xl font-bold text-gray-900 border-b-2 border-orange-500 bg-transparent focus:outline-none"
            />
          ) : (
            <h1
              className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-orange-600"
              onClick={() => {
                setEditedName(list.name);
                setIsEditingName(true);
              }}
              title="Click to rename"
            >
              {list.name}
            </h1>
          )}
        </div>

        {/* Actions */}
        <div className="ml-4 flex items-center gap-2">
          {/* Share */}
          <div className="relative">
            <button
              onClick={handleCopyShareLink}
              disabled={isCreatingShare}
              className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50 hover:text-orange-600 disabled:opacity-50"
              title="Share list"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
              </svg>
            </button>
          </div>

          {/* Delete */}
          <button
            onClick={handleDelete}
            className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-red-50 hover:text-red-500"
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
      </div>

      {/* Items grouped by category */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {uncheckedItems.length === 0 && checkedItems.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">
            No items yet. Add some below.
          </p>
        )}

        {categoryGroups.map((group) => (
          <CategorySection
            key={group.category}
            category={group.category}
            items={group.items}
            onToggle={handleToggleItem}
            onDelete={handleDeleteItem}
          />
        ))}

        {/* Add item input */}
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

        {/* Checked items section at bottom */}
        {checkedItems.length > 0 && (
          <div className="border-t border-gray-200">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
              <span className="text-sm font-medium text-gray-500">
                Checked ({checkedItems.length})
              </span>
              <button
                onClick={() => uncheckAll()}
                className="text-xs text-orange-600 hover:text-orange-700 font-medium"
              >
                Uncheck all
              </button>
            </div>
            <div className="divide-y divide-gray-100 px-4">
              {checkedItems.map((item) => (
                <RollupItemRow
                  key={item.canonical_item}
                  item={item}
                  isChecked
                  onToggle={() => handleUncheckItem(item)}
                  onDelete={() => handleDeleteItem(item)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Share status */}
      {list.share_token && (
        <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <div className="flex items-center justify-between">
            <span>This list is shared via link.</span>
            <button
              onClick={() => {
                if (confirm("Revoke the share link?")) {
                  revokeShareLink();
                }
              }}
              className="text-orange-600 hover:text-orange-800 font-medium"
            >
              Revoke
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
