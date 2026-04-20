import { Link } from "react-router-dom";
import { FoodPlaceholder } from "./design-system";
import type { RecipeSummary } from "@rr/shared/types";

export default function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  return (
    <Link
      to={`/recipe/${recipe.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ position: "relative" }}>
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt={recipe.title}
            loading="lazy"
            style={{
              width: "100%",
              aspectRatio: "3/2",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <FoodPlaceholder label={recipe.title} ratio="3/2" />
        )}
        {recipe.total_time != null && (
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
            {recipe.total_time}m
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          className="serif"
          style={{
            fontSize: 20,
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {recipe.title}
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
          {recipe.domain}
        </div>
      </div>
    </Link>
  );
}
