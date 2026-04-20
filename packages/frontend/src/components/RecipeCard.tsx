import { useState } from "react";
import { Link } from "react-router-dom";
import type { RecipeSummary } from "@rr/shared/types";

function RecipePlaceholder({ ratio = "3/2" }: { ratio?: string }) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: ratio,
        background: "oklch(0.82 0.03 200)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src="/placeholder-recipe.png"
        alt=""
        style={{ width: "40%", opacity: 0.9, filter: "brightness(10)" }}
      />
    </div>
  );
}

export default function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const [imgStatus, setImgStatus] = useState<"loading" | "loaded" | "error">(
    recipe.image_url ? "loading" : "error"
  );

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
        {imgStatus === "error" ? (
          <RecipePlaceholder />
        ) : (
          <>
            <img
              src={recipe.image_url!}
              alt={recipe.title}
              loading="lazy"
              onLoad={() => setImgStatus("loaded")}
              onError={() => setImgStatus("error")}
              style={{
                width: "100%",
                aspectRatio: "3/2",
                objectFit: "cover",
                display: imgStatus === "loaded" ? "block" : "none",
              }}
            />
            {imgStatus === "loading" && <RecipePlaceholder />}
          </>
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

export { RecipePlaceholder };
