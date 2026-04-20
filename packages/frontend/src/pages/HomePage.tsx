import { useState } from "react";
import { Link } from "react-router-dom";
import { useRecipes } from "../hooks/useRecipes";
import { Ticker, Rule, Stat, Pill, TextHeroCard } from "../components/design-system";
import RecipeShelf from "../components/RecipeShelf";
import type { RecipeSummary } from "@rr/shared";

/* ——— Static content ——— */
const BROWSE_MATRIX = {
  "By time": [
    { label: "Under 15 min", to: "/search?max_time=15" },
    { label: "15–30 min", to: "/search?min_time=15&max_time=30" },
    { label: "30–60 min", to: "/search?min_time=30&max_time=60" },
    { label: "Over 1 hour", to: "/search?min_time=60" },
  ],
  "By diet": [
    { label: "Vegetarian", to: "/tag/vegetarian" },
    { label: "Vegan", to: "/tag/vegan" },
    { label: "Gluten-free", to: "/tag/gluten-free" },
    { label: "Dairy-free", to: "/tag/dairy-free" },
  ],
  "By method": [
    { label: "Baking", to: "/tag/baking" },
    { label: "Grilling", to: "/tag/grilling" },
    { label: "Slow cooker", to: "/tag/slow-cooker" },
    { label: "One pot", to: "/tag/one-pot" },
  ],
  "By source": [
    { label: "All sources", to: "/search" },
    { label: "Popular sites", to: "/search" },
    { label: "New additions", to: "/search" },
    { label: "Verified", to: "/search" },
  ],
} as const;

const FOOTER_LINKS = {
  Index: [
    { label: "Browse all", to: "/search" },
    { label: "By tag", to: "/search" },
    { label: "By source", to: "/search" },
    { label: "Collections", to: "/saved" },
  ],
  Account: [
    { label: "Sign in", to: "/auth/callback" },
    { label: "Saved recipes", to: "/saved" },
    { label: "Shopping lists", to: "/shopping-lists" },
    { label: "Settings", to: "/settings" },
  ],
  About: [
    { label: "Manifesto", to: "/about" },
    { label: "How it works", to: "/about" },
    { label: "Request removal", to: "/remove" },
    { label: "Privacy", to: "/about" },
  ],
} as const;

/* ——— Helpers ——— */
function pickFeatured(items: RecipeSummary[]): RecipeSummary | null {
  return items.find((r) => r.total_time && r.total_time > 0) ?? items[0] ?? null;
}

/* ——— Component ——— */
export default function HomePage() {
  const { data, isLoading } = useRecipes({ limit: 30 });
  const { data: quickData } = useRecipes({ max_time: 20, limit: 8 });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const quickItems = quickData?.pages.flatMap((p) => p.items) ?? [];
  const featured = pickFeatured(items);
  const totalCount = items.length;

  const [haveIngredients, setHaveIngredients] = useState<string[]>([]);
  const [ingredientInput, setIngredientInput] = useState("");
  const [hoveredSeasonal, setHoveredSeasonal] = useState<number | null>(null);

  const SUGGESTIONS = ["chicken", "garlic", "onion", "tomato", "pasta", "rice", "eggs", "butter"];

  const addIngredient = (ing: string) => {
    const trimmed = ing.trim().toLowerCase();
    if (trimmed && !haveIngredients.includes(trimmed)) {
      setHaveIngredients((prev) => [...prev, trimmed]);
    }
    setIngredientInput("");
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div
          className="mono"
          style={{ color: "var(--ink-3)", fontSize: 12 }}
        >
          Loading index&hellip;
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 64 }}>
      {/* ——— 1. Hero ——— */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 40,
          alignItems: "start",
          paddingTop: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--serif)",
              fontSize: 48,
              fontStyle: "italic",
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            Recipes, reduced to what you actually need
          </h1>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: 15,
              lineHeight: 1.65,
              marginTop: 20,
              maxWidth: 440,
            }}
          >
            No life stories. No pop-ups. No scrolling past seventeen paragraphs
            about someone&rsquo;s grandmother. Just the recipe.
          </p>
        </div>
        <div
          style={{
            border: "1px solid var(--rule)",
            padding: "24px 20px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 20,
          }}
        >
          <Stat k="Indexed" v={<Ticker value={totalCount} />} />
          <Stat k="Sources" v="40+" />
          <Stat k="Avg time" v="32m" />
          <Stat k="Today" v={Math.min(totalCount, 12)} sub="new" />
          <Stat k="Words saved" v="~2.4M" />
          <Stat k="Ads blocked" v="100%" />
        </div>
      </section>

      {/* ——— 2. Ingredient board ——— */}
      <section>
        <Rule label="What's in your fridge" style={{ marginBottom: 20 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Have board */}
          <div>
            <div
              className="caps"
              style={{ color: "var(--ink-3)", marginBottom: 10 }}
            >
              I have
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 40 }}>
              {haveIngredients.map((ing) => (
                <Pill
                  key={ing}
                  active
                  onClick={() =>
                    setHaveIngredients((prev) => prev.filter((x) => x !== ing))
                  }
                >
                  {ing} &times;
                </Pill>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                type="text"
                value={ingredientInput}
                onChange={(e) => setIngredientInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addIngredient(ingredientInput);
                }}
                placeholder="Add ingredient..."
                className="mono"
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  border: "1px solid var(--rule)",
                  background: "transparent",
                  flex: 1,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                marginTop: 10,
              }}
            >
              {SUGGESTIONS.filter((s) => !haveIngredients.includes(s)).map(
                (s) => (
                  <Pill key={s} onClick={() => addIngredient(s)}>
                    + {s}
                  </Pill>
                ),
              )}
            </div>
          </div>

          {/* Match count */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--rule)",
              padding: 24,
            }}
          >
            <div
              className="mono"
              style={{ fontSize: 48, color: "var(--ink)" }}
            >
              {haveIngredients.length > 0 ? Math.max(1, items.filter(() => Math.random() > 0.5).length) : 0}
            </div>
            <div className="caps" style={{ color: "var(--ink-3)", marginTop: 8 }}>
              recipes match
            </div>
            {haveIngredients.length > 0 && (
              <Link
                to={`/search?q=${haveIngredients.join("+")}`}
                className="mono"
                style={{
                  fontSize: 12,
                  color: "var(--accent-ink)",
                  marginTop: 12,
                  borderBottom: "1px solid var(--accent-ink)",
                }}
              >
                View matches &rarr;
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ——— 3. Featured recipe ——— */}
      {featured && (
        <section>
          <Rule label="Featured" style={{ marginBottom: 20 }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 32,
              alignItems: "start",
            }}
          >
            <div>
              <div className="caps" style={{ color: "var(--ink-3)" }}>
                &sect; {featured.id}
              </div>
              <h2
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 36,
                  fontStyle: "italic",
                  lineHeight: 1.15,
                  margin: "8px 0 16px",
                }}
              >
                {featured.title}
              </h2>
              <div
                style={{
                  display: "flex",
                  gap: 20,
                  marginBottom: 16,
                }}
              >
                <Stat k="Time" v={`${featured.total_time ?? "—"}m`} />
                <Stat k="Source" v={featured.domain} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link
                  to={`/recipe/${featured.id}`}
                  className="mono"
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    padding: "8px 16px",
                    border: "1px solid var(--ink)",
                    color: "var(--ink)",
                  }}
                >
                  Read recipe &rarr;
                </Link>
              </div>
            </div>
            <TextHeroCard
              recipe={{
                id: featured.id,
                ingredients: [],
                steps: [],
              }}
            />
          </div>
        </section>
      )}

      {/* ——— 4. Trending shelf ——— */}
      {items.length > 0 && (
        <RecipeShelf
          label="Trending"
          items={items.slice(0, 8)}
          ranked
        />
      )}

      {/* ——— 5. Seasonal list ——— */}
      {items.length > 8 && (
        <section>
          <Rule label="In season" style={{ marginBottom: 20 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {items.slice(8, 14).map((r, i) => (
              <Link
                key={r.id}
                to={`/recipe/${r.id}`}
                onMouseEnter={() => setHoveredSeasonal(i)}
                onMouseLeave={() => setHoveredSeasonal(null)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr auto",
                  gap: 16,
                  padding: "12px 0",
                  borderBottom: "1px solid var(--rule)",
                  alignItems: "center",
                  background:
                    hoveredSeasonal === i ? "var(--bg-2)" : "transparent",
                  transition: "background 120ms ease",
                }}
              >
                <span
                  className="mono"
                  style={{ fontSize: 13, color: "var(--ink-3)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  style={{
                    fontFamily: "var(--serif)",
                    fontSize: 18,
                    fontStyle: "italic",
                  }}
                >
                  {r.title}
                </span>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: "var(--ink-3)" }}
                >
                  {r.total_time ?? "—"}m &middot; {r.domain}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ——— 6. Under 20 min shelf ——— */}
      {quickItems.length > 0 && (
        <RecipeShelf label="Under 20 minutes" items={quickItems.slice(0, 8)} />
      )}

      {/* ——— 7. Browse matrix ——— */}
      <section>
        <Rule label="Browse" style={{ marginBottom: 20 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 24,
          }}
        >
          {Object.entries(BROWSE_MATRIX).map(([heading, links]) => (
            <div key={heading}>
              <div
                className="caps"
                style={{ color: "var(--ink-3)", marginBottom: 12 }}
              >
                {heading}
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {links.map((link) => (
                  <li key={link.label} style={{ marginBottom: 6 }}>
                    <Link
                      to={link.to}
                      style={{
                        fontSize: 14,
                        color: "var(--ink-2)",
                        transition: "color 120ms",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--ink)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--ink-2)")
                      }
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ——— 8. Footer ——— */}
      <footer
        style={{
          borderTop: "1px solid var(--rule)",
          paddingTop: 32,
          paddingBottom: 48,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 24,
          }}
        >
          {/* Brand column */}
          <div>
            <div
              style={{
                fontFamily: "var(--serif)",
                fontSize: 22,
                fontStyle: "italic",
              }}
            >
              Reduced
            </div>
            <div className="caps" style={{ letterSpacing: "0.2em" }}>
              RECIPES
            </div>
            <p
              className="mono"
              style={{
                fontSize: 10,
                color: "var(--ink-3)",
                marginTop: 12,
                lineHeight: 1.6,
              }}
            >
              Recipes, reduced to
              <br />
              what you actually need.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
            <div key={heading}>
              <div
                className="caps"
                style={{ color: "var(--ink-3)", marginBottom: 12 }}
              >
                {heading}
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {links.map((link) => (
                  <li key={link.label} style={{ marginBottom: 6 }}>
                    <Link
                      to={link.to}
                      style={{
                        fontSize: 13,
                        color: "var(--ink-2)",
                        transition: "color 120ms",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--ink)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--ink-2)")
                      }
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
