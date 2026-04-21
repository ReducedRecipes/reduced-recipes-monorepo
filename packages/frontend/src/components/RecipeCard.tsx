import { useState } from "react";
import { Link } from "react-router-dom";
import type { RecipeSummary } from "@rr/shared/types";
import { heartRecipe, unheartRecipe } from "../lib/api";

export function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
}

export function RecipePlaceholder({ ratio = "3/2" }: { ratio?: string }) {
  return (
    <div
      className="bg-gray-200"
      style={{
        width: "100%",
        aspectRatio: ratio,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid var(--rule)",
      }}
    >
      <img
        src="/placeholder-recipe.png"
        alt=""
        style={{ width: "30%", opacity: 0.45 }}
      />
    </div>
  );
}

export default function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const [imgStatus, setImgStatus] = useState<"loading" | "loaded" | "error">(
    recipe.image_url ? "loading" : "error",
  );
  const [hearted, setHearted] = useState(false);
  const [voteCount, setVoteCount] = useState(recipe.vote_count ?? 0);

  const handleHeart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextHearted = !hearted;
    setHearted(nextHearted);
    setVoteCount((c) => c + (nextHearted ? 1 : -1));
    try {
      const res = nextHearted
        ? await heartRecipe(recipe.id)
        : await unheartRecipe(recipe.id);
      setVoteCount(res.vote_count);
    } catch {
      // Revert on error
      setHearted(!nextHearted);
      setVoteCount((c) => c + (nextHearted ? -1 : 1));
    }
  };

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
              display: "block",
            }}
          />
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
            {formatTime(recipe.total_time)}
          </div>
        )}
        <button
          type="button"
          onClick={handleHeart}
          aria-label={hearted ? "Un-heart recipe" : "Heart recipe"}
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            background: "var(--bg)",
            border: "1px solid var(--rule-2)",
            padding: "4px 6px",
            display: "flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
            color: hearted ? "#e53e3e" : "var(--ink-3)",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width={12}
            height={12}
            aria-hidden="true"
          >
            <path
              d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
              fill={hearted ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.5}
            />
          </svg>
          {voteCount > 0 && (
            <span
              className="mono"
              style={{ fontSize: 10, color: "var(--ink-2)" }}
            >
              {voteCount}
            </span>
          )}
        </button>
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
