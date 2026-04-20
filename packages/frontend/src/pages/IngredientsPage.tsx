import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchByIngredients } from "../lib/api";
import type { IngredientSearchResult } from "../lib/api";
import IngredientBoard from "../components/IngredientBoard";
import { Ticker } from "../components/design-system";

function ResultCard({ recipe }: { recipe: IngredientSearchResult }) {
  const [imgFailed, setImgFailed] = useState(false);
  const pct = recipe.match.total > 0
    ? Math.round((recipe.match.have / recipe.match.total) * 100)
    : 0;

  return (
    <Link
      to={`/recipe/${recipe.id}`}
      style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 10, textDecoration: "none", color: "inherit" }}
    >
      <div style={{ position: "relative" }}>
        {recipe.image_url && !imgFailed ? (
          <img
            src={recipe.image_url}
            alt={recipe.title}
            onError={() => setImgFailed(true)}
            loading="lazy"
            style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", border: "1px solid var(--rule-2)" }}
          />
        ) : (
          <div style={{
            aspectRatio: "4/3", border: "1px solid var(--rule-2)", padding: "16px 14px",
            background: "var(--bg-2)", display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", color: "var(--ink-3)" }}>
              {recipe.domain}
            </div>
            <div className="serif" style={{ fontSize: 22, lineHeight: 1.1, fontStyle: "italic" }}>
              {recipe.title}
            </div>
          </div>
        )}
        {recipe.total_time != null && (
          <div className="mono" style={{
            position: "absolute", top: 8, right: 8, background: "var(--bg)",
            fontSize: 10, padding: "3px 6px", border: "1px solid var(--rule-2)",
          }}>
            {recipe.total_time}m
          </div>
        )}
        {/* Match badge */}
        <div className="mono" style={{
          position: "absolute", bottom: 8, left: 8, background: "var(--ink)",
          color: "var(--bg)", fontSize: 10, padding: "3px 8px",
        }}>
          {recipe.match.have}/{recipe.match.total} ({pct}%)
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="serif" style={{ fontSize: 18, letterSpacing: "-0.01em", lineHeight: 1.15 }}>
          {recipe.title}
        </div>
        {recipe.match.missing.length > 0 && (
          <div className="mono" style={{ fontSize: 10, color: "var(--accent-ink)", lineHeight: 1.4 }}>
            Need: {recipe.match.missing.slice(0, 3).join(", ")}
            {recipe.match.missing.length > 3 && ` +${recipe.match.missing.length - 3} more`}
          </div>
        )}
        <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", marginTop: 2 }}>
          {recipe.domain}
        </div>
      </div>
    </Link>
  );
}

export default function IngredientsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const haveParam = searchParams.get("have") ?? "";
  const excludeParam = searchParams.get("exclude") ?? "";

  const [have, setHave] = useState<string[]>(haveParam ? haveParam.split(",").filter(Boolean) : []);
  const [excluded, setExcluded] = useState<string[]>(excludeParam ? excludeParam.split(",").filter(Boolean) : []);

  // Sync URL when ingredients change
  useEffect(() => {
    const next = new URLSearchParams();
    if (have.length > 0) next.set("have", have.join(","));
    if (excluded.length > 0) next.set("exclude", excluded.join(","));
    setSearchParams(next, { replace: true });
  }, [have, excluded, setSearchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ["ingredient-search", have, excluded],
    queryFn: () => searchByIngredients(have, excluded, 48),
    enabled: have.length > 0,
  });

  const results = data?.items ?? [];

  return (
    <main style={{ minHeight: "80vh" }}>
      {/* Ingredient boards */}
      <section style={{ padding: "40px 0", borderBottom: "1px solid var(--rule)" }}>
        <div className="caps" style={{ color: "var(--accent-ink)", marginBottom: 12 }}>
          ◆ What&rsquo;s in your fridge
        </div>
        <h1 className="serif" style={{
          fontSize: "clamp(36px, 5vw, 56px)", fontStyle: "italic", lineHeight: 0.95,
          letterSpacing: "-0.02em", margin: "0 0 28px", fontWeight: 400,
        }}>
          Search by ingredients
        </h1>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
          <IngredientBoard
            title="Have"
            items={have}
            onAdd={(it) => setHave((prev) => [...prev, it])}
            onRemove={(it) => setHave((prev) => prev.filter((x) => x !== it))}
          />
          <IngredientBoard
            title="Exclude"
            items={excluded}
            onAdd={(it) => setExcluded((prev) => [...prev, it])}
            onRemove={(it) => setExcluded((prev) => prev.filter((x) => x !== it))}
            negative
          />
        </div>
        {have.length > 0 && (
          <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 16 }}>
            <Ticker value={results.length} /> recipes match · sorted by fewest extra ingredients
          </div>
        )}
      </section>

      {/* Results */}
      <section style={{ padding: "40px 0" }}>
        {have.length === 0 ? (
          <div style={{ padding: "60px 40px", textAlign: "center", border: "1px dashed var(--rule-2)" }}>
            <div className="serif" style={{ fontSize: 28, fontStyle: "italic", color: "var(--ink-3)", marginBottom: 8 }}>
              Add ingredients to search
            </div>
            <div style={{ fontSize: 14, color: "var(--ink-2)" }}>
              Type an ingredient in the &ldquo;Have&rdquo; box above to find recipes you can cook.
            </div>
          </div>
        ) : isLoading ? (
          <div style={{ padding: "60px 40px", textAlign: "center" }}>
            <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Searching...</div>
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: "60px 40px", textAlign: "center", border: "1px dashed var(--rule-2)" }}>
            <div className="serif" style={{ fontSize: 28, fontStyle: "italic", color: "var(--ink-3)", marginBottom: 8 }}>
              No recipes found
            </div>
            <div style={{ fontSize: 14, color: "var(--ink-2)" }}>
              Try different ingredients or remove some exclusions.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 24 }}>
            {results.map((r) => (
              <ResultCard key={r.id} recipe={r} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
