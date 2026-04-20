import { useState } from "react";
import { Link } from "react-router-dom";
import { RecipePlaceholder } from "./RecipeCard";
import type { RecipeSummary } from "@rr/shared";

interface RecipeShelfProps {
  /** Format: "Fig. 004 — Trending this week" */
  title: string;
  items: RecipeSummary[];
  ranked?: boolean;
}

function ShelfCard({ r, index, ranked }: { r: RecipeSummary; index: number; ranked?: boolean }) {
  const [imgStatus, setImgStatus] = useState<"loading" | "loaded" | "error">(
    r.image_url ? "loading" : "error"
  );

  return (
    <Link
      to={`/recipe/${r.id}`}
      style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ position: "relative" }}>
        {imgStatus === "error" ? (
          <RecipePlaceholder ratio="1/1" />
        ) : (
          <img
            src={r.image_url!}
            alt={r.title}
            onLoad={() => setImgStatus("loaded")}
            onError={() => setImgStatus("error")}
            style={{
              width: "100%",
              aspectRatio: "1/1",
              objectFit: "cover",
              display: "block",
            }}
          />
        )}
        {ranked && (
          <div
            className="mono"
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              background: "var(--ink)",
              color: "var(--bg)",
              fontSize: 10,
              padding: "3px 6px",
              letterSpacing: "0.08em",
            }}
          >
            {String(index + 1).padStart(2, "0")}
          </div>
        )}
        {r.total_time != null && r.total_time > 0 && (
          <div
            className="mono"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "var(--bg)",
              color: "var(--ink-2)",
              fontSize: 10,
              padding: "3px 6px",
              border: "1px solid var(--rule-2)",
            }}
          >
            {r.total_time}m
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          className="serif"
          style={{
            fontSize: 22,
            letterSpacing: "-0.01em",
            lineHeight: 1.1,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {r.title}
        </div>
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--ink-3)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {r.domain}
        </div>
      </div>
    </Link>
  );
}

export default function RecipeShelf({ title, items, ranked }: RecipeShelfProps) {
  const parts = title.split(" — ");
  const figLabel = parts[0] ?? title;
  const shelfTitle = parts[1] ?? "";

  return (
    <section
      style={{
        padding: "48px 0",
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 24,
        }}
      >
        <div>
          <div
            className="caps"
            style={{ color: "var(--accent-ink)", marginBottom: 6 }}
          >
            ◆ {figLabel}
          </div>
          <div
            className="serif"
            style={{
              fontSize: 40,
              letterSpacing: "-0.015em",
              fontStyle: "italic",
            }}
          >
            {shelfTitle}
          </div>
        </div>
        <Link
          to="/search"
          className="mono"
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--ink-2)",
          }}
        >
          See all &rarr;
        </Link>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(items.length, 6)}, 1fr)`,
          gap: 20,
        }}
      >
        {items.map((r, i) => (
          <ShelfCard key={r.id} r={r} index={i} ranked={ranked ?? false} />
        ))}
      </div>
    </section>
  );
}
