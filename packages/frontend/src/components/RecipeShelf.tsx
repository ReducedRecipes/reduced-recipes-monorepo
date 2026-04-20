import { Link } from "react-router-dom";
import { TextThumb } from "./design-system";
import { Rule } from "./design-system";
import type { RecipeSummary } from "@rr/shared";

interface RecipeShelfProps {
  label: string;
  items: RecipeSummary[];
  ranked?: boolean;
}

export default function RecipeShelf({ label, items, ranked }: RecipeShelfProps) {
  return (
    <section>
      <Rule label={label} style={{ marginBottom: 20 }} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        {items.map((r, i) => (
          <Link key={r.id} to={`/recipe/${r.id}`} style={{ position: "relative" }}>
            {ranked && (
              <span
                className="mono"
                style={{
                  position: "absolute",
                  top: 6,
                  right: 8,
                  fontSize: 10,
                  color: "var(--ink-3)",
                  zIndex: 1,
                }}
              >
                #{i + 1}
              </span>
            )}
            <TextThumb
              recipe={{
                id: r.id,
                title: r.title,
                time: r.total_time ?? 0,
                reviews: 0,
              }}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
