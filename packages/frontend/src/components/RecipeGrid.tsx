import type { RecipeSummary } from "@rr/shared/types";
import RecipeCard from "./RecipeCard";

interface RecipeGridProps {
  items: RecipeSummary[];
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  emptyMessage?: string;
}

export default function RecipeGrid({
  items,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  emptyMessage = "No recipes found",
}: RecipeGridProps) {
  if (items.length === 0) {
    return (
      <p
        className="mono"
        style={{
          textAlign: "center",
          color: "var(--ink-3)",
          padding: "48px 0",
          fontSize: 13,
        }}
      >
        {emptyMessage}
      </p>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 24,
        }}
      >
        {items.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
      {hasNextPage && (
        <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              padding: "12px 24px",
              background: isFetchingNextPage ? "transparent" : "var(--ink)",
              color: isFetchingNextPage ? "var(--ink-3)" : "var(--bg)",
              border: "1px solid var(--ink)",
              cursor: isFetchingNextPage ? "default" : "pointer",
              opacity: isFetchingNextPage ? 0.5 : 1,
            }}
          >
            {isFetchingNextPage ? "Loading\u2026" : "Load more \u2192"}
          </button>
        </div>
      )}
    </div>
  );
}
