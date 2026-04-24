import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { useBookmarks } from "../hooks/useBookmarks";
import { CollectionList } from "../components/CollectionList";
import { fetchRecipe } from "../lib/api";
import { BookmarkButton } from "../components/BookmarkButton";
import { useEffect } from "react";

function BookmarkedRecipeCard({ recipeId }: { recipeId: string }) {
  const { data: recipe, isLoading } = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: () => fetchRecipe(recipeId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div style={{ height: 80, background: "var(--bg-2)", border: "1px solid var(--rule)" }} />
    );
  }

  if (!recipe) return null;

  return (
    <div
      style={{
        position: "relative",
        border: "1px solid var(--rule)",
        background: "var(--bg)",
      }}
    >
      <Link to={`/recipe/${recipeId}`} style={{ display: "flex", gap: 14, padding: 12, paddingRight: 40 }}>
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt={recipe.title}
            style={{ width: 72, height: 72, flexShrink: 0, objectFit: "cover" }}
          />
        ) : (
          <div style={{ width: 72, height: 72, flexShrink: 0, background: "var(--bg-2)" }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500, lineHeight: 1.3 }}>
            {recipe.title}
          </div>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
            {recipe.domain}
          </div>
        </div>
      </Link>
      <div style={{ position: "absolute", top: 12, right: 10 }}>
        <BookmarkButton recipeId={recipeId} compact />
      </div>
    </div>
  );
}

export default function SavedPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { bookmarks, isLoading: bookmarksLoading } = useBookmarks();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>
          Loading&hellip;
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 0" }}>
      <div className="caps" style={{ color: "var(--accent-ink)", marginBottom: 16 }}>
        ◆ Saved Recipes
      </div>
      <h1 className="serif" style={{ fontSize: 40, margin: "0 0 40px", lineHeight: 1 }}>
        Bookmarks &amp; Collections
      </h1>

      <div
        className="saved-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 260px",
          gap: 48,
        }}
      >
        {/* Bookmarked recipes */}
        <div>
          <div className="caps" style={{ color: "var(--ink-3)", marginBottom: 16 }}>
            Bookmarks
          </div>
          {bookmarksLoading ? (
            <div className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>
              Loading&hellip;
            </div>
          ) : bookmarks.length === 0 ? (
            <div
              style={{
                padding: "40px 0",
                textAlign: "center",
                color: "var(--ink-3)",
                fontSize: 14,
                borderTop: "1px solid var(--rule)",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              No bookmarks yet. Browse recipes and save them here.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {bookmarks.map((bookmark) => (
                <BookmarkedRecipeCard
                  key={bookmark.id}
                  recipeId={bookmark.recipe_id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Collections sidebar */}
        <div>
          <div className="caps" style={{ color: "var(--ink-3)", marginBottom: 16 }}>
            Collections
          </div>
          <div
            style={{
              padding: 16,
              border: "1px solid var(--rule)",
              background: "var(--bg-2)",
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <CollectionList />
          </div>
        </div>
      </div>
    </main>
  );
}
