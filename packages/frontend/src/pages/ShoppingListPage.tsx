import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  useShoppingList,
  useShoppingListItems,
  useShareLink,
  useShoppingLists,
} from "../hooks/useShoppingLists";
import { Rule } from "../components/design-system";
import type { SmartRollupItem } from "@rr/shared";

function RollupItemRow({
  item,
  onToggle,
  onDelete,
  isChecked = false,
  recipes = {},
}: {
  item: SmartRollupItem;
  onToggle: () => void;
  onDelete: () => void;
  isChecked?: boolean;
  recipes?: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const sources = item.sources ?? [];
  const uniqueRecipeIds = new Set(
    sources.filter((s) => s.recipe_id).map((s) => s.recipe_id),
  );
  const recipeCount = uniqueRecipeIds.size;
  const hasMultipleSources = recipeCount >= 2;

  return (
    <div style={{ padding: "10px 0" }} className="group">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onToggle}
          style={{
            flexShrink: 0,
            width: 18,
            height: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: isChecked ? "2px solid var(--accent)" : "2px solid var(--rule-2)",
            background: isChecked ? "var(--accent)" : "transparent",
            color: isChecked ? "var(--bg)" : "transparent",
          }}
        >
          {isChecked && (
            <svg
              style={{ width: 10, height: 10 }}
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 6l3 3 5-5" />
            </svg>
          )}
        </button>
        <span
          style={{
            flex: 1,
            fontSize: 14,
            color: isChecked ? "var(--ink-3)" : "var(--ink)",
            textDecoration: isChecked ? "line-through" : "none",
            cursor: hasMultipleSources ? "pointer" : "default",
          }}
          onClick={hasMultipleSources ? () => setExpanded(!expanded) : undefined}
        >
          {item.display_text}
          {hasMultipleSources && (
            <span className="mono" style={{ marginLeft: 6, fontSize: 11, color: "var(--ink-3)" }}>
              ({recipeCount} recipes)
            </span>
          )}
          {recipeCount === 1 && (() => {
            const recipeId = [...uniqueRecipeIds][0]!;
            return (
              <Link
                to={`/recipe/${recipeId}`}
                className="mono"
                style={{ marginLeft: 6, fontSize: 10, color: "var(--ink-3)", textDecoration: "none" }}
                onClick={(e) => e.stopPropagation()}
              >
                {recipes[recipeId] || "recipe"}
              </Link>
            );
          })()}
        </span>
        <button
          onClick={onDelete}
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--ink-3)",
            opacity: 0,
            padding: "4px 8px",
            border: "1px solid var(--rule)",
            background: "transparent",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0"; }}
          title="Remove item"
        >
          ×
        </button>
      </div>
      {hasMultipleSources && expanded && (
        <div
          style={{
            marginLeft: 30,
            marginTop: 6,
            paddingLeft: 12,
            borderLeft: "2px solid var(--rule)",
          }}
        >
          {sources
            .filter((s) => s.recipe_id)
            .map((source) => (
              <div
                key={source.item_id}
                className="mono"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "var(--ink-2)",
                  padding: "3px 0",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {recipes[source.recipe_id!] || source.original_text || item.canonical_item}
                  {source.quantity != null && ` (${source.quantity}${item.unit ? ` ${item.unit}` : ""})`}
                </span>
                <Link
                  to={`/recipe/${source.recipe_id}`}
                  style={{ flexShrink: 0, color: "var(--accent-ink)" }}
                >
                  view →
                </Link>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function AisleSection({
  category,
  items,
  onToggle,
  onDelete,
  recipes = {},
}: {
  category: string;
  items: SmartRollupItem[];
  onToggle: (item: SmartRollupItem) => void;
  onDelete: (item: SmartRollupItem) => void;
  recipes?: Record<string, string>;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ borderBottom: "1px solid var(--rule)" }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          background: "var(--bg-2)",
        }}
      >
        <span className="caps" style={{ color: "var(--ink-2)" }}>{category}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{items.length}</span>
          <span style={{ color: "var(--ink-3)", transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 0.15s" }}>
            ▾
          </span>
        </div>
      </button>
      {!collapsed && (
        <div style={{ padding: "0 16px" }}>
          {items.map((item) => (
            <RollupItemRow
              key={item.canonical_item}
              item={item}
              onToggle={() => onToggle(item)}
              onDelete={() => onDelete(item)}
              recipes={recipes}
            />
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
  const [copied, setCopied] = useState(false);
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
      <div className="flex justify-center py-20">
        <div className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>
          Loading&hellip;
        </div>
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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      createShareLink();
    }
  };

  const uncheckedItems = list.items.unchecked;
  const checkedItems = list.items.checked;
  const recipeTitleMap = list.recipes ?? {};

  // Group unchecked items by aisle category
  const AISLE_ORDER = [
    'Produce', 'Dairy & Eggs', 'Meat & Seafood', 'Bakery',
    'Pantry', 'Spices & Seasonings', 'Oils & Vinegars',
    'Condiments & Sauces', 'Beverages', 'Frozen', 'Other',
  ];
  const uncheckedByAisle = (() => {
    const groups = new Map<string, SmartRollupItem[]>();
    for (const item of uncheckedItems) {
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

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 0" }}>
      {/* Back link */}
      <button
        onClick={() => navigate("/shopping-lists")}
        className="mono"
        style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 24, display: "block" }}
      >
        ← All Lists
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
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
              className="serif"
              style={{
                width: "100%",
                fontSize: 32,
                background: "transparent",
                border: "none",
                borderBottom: "2px solid var(--accent)",
                outline: "none",
                color: "var(--ink)",
                padding: 0,
              }}
            />
          ) : (
            <h1
              className="serif"
              style={{ fontSize: 32, margin: 0, lineHeight: 1.1, cursor: "pointer" }}
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
        <div style={{ marginLeft: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={handleCopyShareLink}
            disabled={isCreatingShare}
            className="mono"
            style={{
              fontSize: 11,
              padding: "8px 12px",
              border: "1px solid var(--rule-2)",
              background: "transparent",
              color: "var(--ink-2)",
              opacity: isCreatingShare ? 0.5 : 1,
              cursor: isCreatingShare ? "not-allowed" : "pointer",
            }}
            title="Share list"
          >
            {copied ? "Copied!" : "Share"}
          </button>
          <button
            onClick={handleDelete}
            className="mono"
            style={{
              fontSize: 11,
              padding: "8px 12px",
              border: "1px solid var(--rule-2)",
              background: "transparent",
              color: "var(--ink-3)",
            }}
            title="Delete list"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Items container */}
      <div style={{ border: "1px solid var(--rule)", background: "var(--bg)" }}>
        {/* Unchecked items grouped by aisle */}
        {uncheckedItems.length === 0 && checkedItems.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
            No items yet. Add some below.
          </div>
        )}
        {uncheckedByAisle.map(({ category, items }) => (
          <AisleSection
            key={category}
            category={category}
            items={items}
            recipes={recipeTitleMap}
            onToggle={(item) => {
              for (const s of item.sources ?? []) {
                updateItem({ itemId: s.item_id, checked: 1 });
              }
            }}
            onDelete={(item) => {
              for (const s of item.sources ?? []) {
                deleteItem(s.item_id);
              }
            }}
          />
        ))}

        {/* Add item input */}
        <div style={{ borderTop: "1px solid var(--rule)", padding: "12px 16px" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              placeholder="Add an item..."
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
              className="mono"
              style={{
                flex: 1,
                fontSize: 13,
                padding: "10px 12px",
                background: "var(--bg-2)",
                border: "1px solid var(--rule-2)",
                color: "var(--ink)",
                outline: "none",
              }}
            />
            <button
              onClick={handleAddItem}
              disabled={isAdding || !newItemName.trim()}
              className="mono"
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                padding: "10px 16px",
                background: "var(--ink)",
                color: "var(--bg)",
                border: "1px solid var(--ink)",
                opacity: isAdding || !newItemName.trim() ? 0.5 : 1,
                cursor: isAdding || !newItemName.trim() ? "not-allowed" : "pointer",
              }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Checked items */}
        {checkedItems.length > 0 && (
          <div style={{ borderTop: "1px solid var(--rule)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 16px",
                background: "var(--bg-2)",
              }}
            >
              <span className="caps" style={{ color: "var(--ink-3)" }}>
                Checked ({checkedItems.length})
              </span>
              <button
                onClick={() => uncheckAll()}
                className="mono"
                style={{ fontSize: 11, color: "var(--accent-ink)" }}
              >
                Uncheck all
              </button>
            </div>
            <div style={{ padding: "0 16px" }}>
              {checkedItems.map((item) => (
                <RollupItemRow
                  key={item.canonical_item}
                  item={item}
                  isChecked
                  recipes={recipeTitleMap}
                  onToggle={() => {
                    for (const s of item.sources ?? []) {
                      updateItem({ itemId: s.item_id, checked: 0 });
                    }
                  }}
                  onDelete={() => {
                    for (const s of item.sources ?? []) {
                      deleteItem(s.item_id);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Share status */}
      {list.share_token && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            border: "1px solid var(--rule-2)",
            background: "var(--bg-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
              This list is shared via link.
            </span>
            {(list as unknown as { member_count?: number }).member_count != null &&
              (list as unknown as { member_count: number }).member_count > 0 && (
              <span className="mono" style={{ fontSize: 11, color: "var(--accent-ink)" }}>
                {(list as unknown as { member_count: number }).member_count}{" "}
                {(list as unknown as { member_count: number }).member_count === 1 ? "person" : "people"}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              if (confirm("Revoke the share link?")) {
                revokeShareLink();
              }
            }}
            className="mono"
            style={{ fontSize: 11, color: "var(--accent-ink)" }}
          >
            Revoke
          </button>
        </div>
      )}
    </main>
  );
}
