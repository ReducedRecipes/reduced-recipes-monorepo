import { useRef, useEffect } from "react";
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
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchRef = useRef(fetchNextPage);
  fetchRef.current = fetchNextPage;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchRef.current();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
        <div ref={sentinelRef} style={{ padding: "20px 0", textAlign: "center" }}>
          {isFetchingNextPage && (
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Loading&hellip;
            </span>
          )}
        </div>
      )}
    </div>
  );
}
