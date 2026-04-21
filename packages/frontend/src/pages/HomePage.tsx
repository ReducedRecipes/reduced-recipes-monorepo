import { useState } from "react";
import { Link } from "react-router-dom";
import { useRecipes } from "../hooks/useRecipes";
import { useHealth } from "../hooks/useHealth";
import { useFunding } from "../hooks/useFunding";
import {
  Ticker,
  Rule,
  Stat,
} from "../components/design-system";
import RecipeShelf from "../components/RecipeShelf";
import { RecipePlaceholder } from "../components/RecipeCard";
import IngredientBoard from "../components/IngredientBoard";
import type { RecipeSummary } from "@rr/shared";

// INGREDIENT_POOL removed — IngredientBoard now uses live autocomplete

function pickFeatured(items: RecipeSummary[]): RecipeSummary | null {
  // Prefer a recipe with both an image and a cook time
  return (
    items.find((r) => r.image_url && r.total_time && r.total_time > 0) ??
    items.find((r) => r.image_url) ??
    items[0] ??
    null
  );
}

export default function HomePage() {
  const { data, isLoading } = useRecipes({ sort: 'hot', limit: 30 });
  const { data: quickData } = useRecipes({ max_time: 20, limit: 8 });
  const { health } = useHealth();
  const { funding } = useFunding();

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const quickItems = quickData?.pages.flatMap((p) => p.items) ?? [];
  const featured =
    (health?.featured_recipe_id
      ? items.find((r) => r.id === health.featured_recipe_id) ?? null
      : null) ?? pickFeatured(items);
  const totalRecipes = health?.total_recipes ?? 0;
  const totalWordsRemoved = health?.total_words_removed ?? 0;
  const totalAdsRemoved = health?.total_ads_removed ?? 0;

  const trending = items.slice(0, 6);
  const seasonal = items.slice(6, 12);

  const [have, setHave] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>
          Loading index&hellip;
        </div>
      </div>
    );
  }

  return (
    <main>
      {/* ——— Hero: manifesto + stat panel ——— */}
      <section
        style={{
          padding: "60px 0 40px",
          borderBottom: "1px solid var(--rule)",
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 48,
        }}
      >
        <div>
          <div
            className="caps"
            style={{ color: "var(--accent-ink)", marginBottom: 22 }}
          >
            ◆ Fig. 001 — Manifesto
          </div>
          <h1
            className="serif"
            style={{
              fontSize: "clamp(48px, 7vw, 110px)",
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              margin: 0,
              fontWeight: 400,
            }}
          >
            Recipes,
            <br />
            <span style={{ fontStyle: "italic" }}>reduced</span> to what
            <br />
            you actually need.
          </h1>
          <div
            style={{
              marginTop: 28,
              maxWidth: 540,
              color: "var(--ink-2)",
              fontSize: 16,
              lineHeight: 1.55,
            }}
          >
            No backstory about a trip to Tuscany. No ads between steps. No scroll
            to the bottom to find the ingredients. Just the list, the method, and
            the number of minutes until dinner.
          </div>
          <div style={{ marginTop: 32, display: "flex", gap: 10 }}>
            {featured && (
              <Link
                to={`/recipe/${featured.id}`}
                className="mono"
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  padding: "14px 22px",
                  background: "var(--ink)",
                  color: "var(--bg)",
                  border: "1px solid var(--ink)",
                }}
              >
                &rarr; See a recipe
              </Link>
            )}
            <Link
              to="/search"
              className="mono"
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                padding: "14px 22px",
                background: "transparent",
                color: "var(--ink)",
                border: "1px solid var(--ink)",
              }}
            >
              Browse the index
            </Link>
          </div>
        </div>

        {/* Right column: funding tracker + stat panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, justifyContent: "flex-start", alignSelf: "start", marginTop: 32 }}>

          {/* Funding tracker */}
          {funding && funding.monthly_cost > 0 && (() => {
            const cost = funding.monthly_cost;
            const funded = funding.funded_this_month;
            const pct = Math.min(Math.round((funded / cost) * 100), 100);
            const barWidth = Math.min((funded / cost) * 100, 100);
            return (
              <div style={{ padding: "16px 20px", border: "1px solid var(--rule)", position: "relative" }}>
                <div className="caps" style={{ color: "var(--ink-3)", marginBottom: 10 }}>
                  Monthly running costs
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <div className="mono" style={{ fontSize: 22, color: "var(--ink)" }}>
                    ${cost.toFixed(0)}
                    <span style={{ fontSize: 12, color: "var(--ink-3)" }}> /mo</span>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: funded >= cost ? "var(--accent-ink)" : "var(--ink-2)" }}>
                    {pct}% funded
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ height: 4, background: "var(--rule)", width: "100%", marginBottom: 12 }}>
                  <div style={{ height: 4, background: funded >= cost ? "var(--accent)" : "var(--ink)", width: `${barWidth}%`, transition: "width 0.5s ease" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <a
                    href="https://ko-fi.com/reducedrecipes"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono"
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      padding: "8px 14px",
                      background: "var(--ink)",
                      color: "var(--bg)",
                      border: "1px solid var(--ink)",
                    }}
                  >
                    Buy me a coffee
                  </a>
                  <Link
                    to="/transparency"
                    className="mono"
                    style={{ fontSize: 11, color: "var(--ink-3)" }}
                  >
                    Full breakdown &rarr;
                  </Link>
                </div>
              </div>
            );
          })()}

        <aside
          style={{
            border: "1px solid var(--rule-2)",
            padding: "24px 24px 20px",
            background: "var(--bg-2)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -10,
              left: 16,
              background: "var(--bg)",
              padding: "0 8px",
            }}
            className="caps"
          >
            &sect; Specimen 001
          </div>

          <div
            className="serif"
            style={{ fontSize: 82, lineHeight: 1, letterSpacing: "-0.02em" }}
          >
            <Ticker value={totalRecipes} />
          </div>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginTop: 4,
            }}
          >
            Recipes indexed &middot; {totalWordsRemoved.toLocaleString()} filler words removed
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 16,
              marginTop: 28,
              paddingTop: 18,
              borderTop: "1px solid var(--rule)",
            }}
          >
            <Stat k="Avg. cook" v={`${health?.avg_cook_time ?? "—"}`} sub="min" />
            <Stat k="Ads removed" v={totalAdsRemoved.toLocaleString()} />
            <Stat k="Sources" v={`${health?.sources_count ?? "—"}`} />
          </div>

          <div
            style={{
              marginTop: 22,
              paddingTop: 18,
              borderTop: "1px solid var(--rule)",
            }}
          >
            <div
              className="caps"
              style={{ color: "var(--ink-3)", marginBottom: 10 }}
            >
              Today&rsquo;s index
            </div>
            <div
              className="mono"
              style={{ fontSize: 12, lineHeight: 1.85, color: "var(--ink-2)" }}
            >
              {[
                ["New this week", `+${(health?.new_this_week ?? 0).toLocaleString()}`],
                ["Under 30 min", (health?.under_30_min ?? 0).toLocaleString()],
                ["Vegetarian", (health?.vegetarian ?? 0).toLocaleString()],
                ["Translated", (health?.translated_recipes ?? 0).toLocaleString()],
              ].map(([label, val]) => (
                <div
                  key={label}
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>{label}</span>
                  <span>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
        </div>
      </section>

      {/* ——— Ingredient-driven search ——— */}
      <section
        style={{
          padding: "36px 0",
          borderBottom: "1px solid var(--rule)",
        }}
      >
        <Rule label="Fig. 002 — What's in your fridge" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 40,
            marginTop: 20,
          }}
        >
          <IngredientBoard
            title="Have"
            items={have}
            onAdd={(it) => setHave([...have, it])}
            onRemove={(it) => setHave(have.filter((x) => x !== it))}
          />
          <IngredientBoard
            title="Exclude"
            items={excluded}
            onAdd={(it) => setExcluded([...excluded, it])}
            onRemove={(it) => setExcluded(excluded.filter((x) => x !== it))}
            negative
          />
        </div>
        <div
          style={{
            marginTop: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            className="mono"
            style={{ fontSize: 12, color: "var(--ink-2)" }}
          >
            &rarr; <b>{totalRecipes > 0 ? totalRecipes.toLocaleString() : "142,083"}</b> recipes
            match.{" "}
            <span style={{ color: "var(--ink-3)" }}>
              Sorted by: fewest extra ingredients.
            </span>
          </div>
          <Link
            to={`/ingredients${have.length > 0 || excluded.length > 0 ? "?" + [have.length > 0 ? `have=${have.join(",")}` : "", excluded.length > 0 ? `exclude=${excluded.join(",")}` : ""].filter(Boolean).join("&") : ""}`}
            className="mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              padding: "10px 16px",
              background: "var(--accent)",
              color: "#fff",
              border: "1px solid var(--accent)",
            }}
          >
            Run query &rarr;
          </Link>
        </div>
      </section>

      {/* ——— Featured (editorial two-column) ——— */}
      {featured && (
        <section
          style={{
            padding: "48px 0",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: 40,
            }}
          >
            <div>
              <div
                className="caps"
                style={{ color: "var(--accent-ink)", marginBottom: 14 }}
              >
                ◆ Fig. 003 — Feature of the week
              </div>
              <div
                className="serif"
                style={{
                  fontSize: 64,
                  lineHeight: 1,
                  letterSpacing: "-0.015em",
                  fontStyle: "italic",
                }}
              >
                {featured.title}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 24,
                  marginTop: 24,
                  paddingTop: 18,
                  borderTop: "1px solid var(--rule)",
                }}
              >
                <Stat k="Total" v={`${featured.total_time ?? "—"}`} sub="min" />
                <Stat k="Source" v={featured.domain} />
                {featured.yields && <Stat k="Servings" v={featured.yields} />}
              </div>
              <div
                style={{
                  marginTop: 22,
                  maxWidth: 520,
                  fontSize: 15,
                  color: "var(--ink-2)",
                }}
              >
                {featured.category
                  ? `${featured.category} from ${featured.domain}.`
                  : `A recipe from ${featured.domain}.`}
              </div>
              <div style={{ marginTop: 22, display: "flex", gap: 8 }}>
                <Link
                  to={`/recipe/${featured.id}`}
                  className="mono"
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    padding: "12px 18px",
                    background: "var(--ink)",
                    color: "var(--bg)",
                  }}
                >
                  Open recipe &rarr;
                </Link>
                <button
                  className="mono"
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    padding: "12px 18px",
                    border: "1px solid var(--rule-2)",
                  }}
                >
                  &#xFF0B; Save
                </button>
              </div>
            </div>
            <div>
              {featured.image_url ? (
                <img
                  src={featured.image_url}
                  alt={featured.title}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  style={{
                    width: "100%",
                    aspectRatio: "4/3",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                <RecipePlaceholder ratio="4/3" />
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  marginTop: 12,
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                }}
              >
                <span>01 &middot; Prep</span>
                <span>02 &middot; Cook</span>
                <span>03 &middot; Assemble</span>
                <span>04 &middot; Plate</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ——— Trending shelf ——— */}
      {trending.length > 0 && (
        <RecipeShelf
          title="Fig. 004 — Trending this week"
          items={trending}
          ranked
        />
      )}

      {/* ——— Seasonal — numbered rows ——— */}
      {seasonal.length > 0 && (
        <section
          style={{
            padding: "48px 32px",
            borderBottom: "1px solid var(--rule)",
            background: "var(--bg-2)",
            margin: "0 -16px",
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
                ◆ Fig. 005
              </div>
              <div
                className="serif"
                style={{
                  fontSize: 48,
                  letterSpacing: "-0.015em",
                  fontStyle: "italic",
                }}
              >
                In season &middot; April
              </div>
            </div>
            <div
              className="mono"
              style={{ fontSize: 12, color: "var(--ink-3)" }}
            >
              {seasonal.length} of {totalRecipes} &rarr;
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--rule-2)" }}>
            {seasonal.map((r, i) => (
              <Link
                key={r.id}
                to={`/recipe/${r.id}`}
                style={{
                  width: "100%",
                  textAlign: "left",
                  display: "grid",
                  gridTemplateColumns: "50px 1.4fr 1fr 160px 120px 60px",
                  gap: 20,
                  alignItems: "center",
                  padding: "18px 0",
                  borderBottom: "1px solid var(--rule-2)",
                  transition: "background 120ms ease",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "oklch(0.92 0.018 80)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div
                  className="mono"
                  style={{ fontSize: 11, color: "var(--ink-3)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div
                  className="serif"
                  style={{ fontSize: 28, letterSpacing: "-0.01em" }}
                >
                  {r.title}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  {r.category ?? r.domain}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {r.tags?.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="mono"
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        padding: "3px 6px",
                        border: "1px solid var(--rule-2)",
                        color: "var(--ink-3)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 12, color: "var(--ink-2)" }}
                >
                  <div>{r.total_time ? `${r.total_time} min` : ""}</div>
                  <div style={{ color: "var(--ink-3)" }}>{r.domain}</div>
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 18, textAlign: "right", color: "var(--ink-3)" }}
                >
                  &rarr;
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ——— Under 20 min shelf ——— */}
      {quickItems.length > 0 && (
        <RecipeShelf
          title="Fig. 006 — Under 20 minutes"
          items={quickItems.slice(0, 6)}
        />
      )}

      {/* ——— Browse by axis ——— */}
      <section
        style={{
          padding: "60px 0",
          borderBottom: "1px solid var(--rule)",
        }}
      >
        <Rule label="Fig. 007 — Browse by axis" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
            marginTop: 20,
            background: "var(--rule-2)",
            border: "1px solid var(--rule-2)",
          }}
        >
          {[
            {
              k: "By time",
              items: [
                { label: "\u2264 15 min", to: "/search?max_time=15" },
                { label: "\u2264 30 min", to: "/search?max_time=30" },
                { label: "\u2264 1 hr", to: "/search?max_time=60" },
                { label: "All day", to: "/search?min_time=60" },
              ],
            },
            {
              k: "By diet",
              items: [
                { label: "Vegetarian", to: "/search?diet=vegetarian" },
                { label: "Vegan", to: "/search?diet=vegan" },
                { label: "Gluten-free", to: "/search?diet=gluten-free" },
                { label: "Keto", to: "/search?diet=keto" },
              ],
            },
            {
              k: "By method",
              items: [
                { label: "One-pan", to: "/search?method=one-pan" },
                { label: "Sheet-pan", to: "/search?method=sheet-pan" },
                { label: "Slow-cook", to: "/search?method=slow-cook" },
                { label: "No-cook", to: "/search?method=no-cook" },
              ],
            },
            {
              k: "By source",
              items: [
                { label: "All sources", to: "/search" },
                { label: "Popular sites", to: "/search?sort=newest" },
                { label: "New additions", to: "/search?sort=newest" },
                { label: "Verified", to: "/search" },
              ],
            },
          ].map((col) => (
            <div
              key={col.k}
              style={{ background: "var(--bg)", padding: "22px 20px" }}
            >
              <div
                className="caps"
                style={{ color: "var(--ink-3)", marginBottom: 12 }}
              >
                {col.k}
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {col.items.map((it) => (
                  <li
                    key={it.label}
                    style={{
                      padding: "10px 0",
                      borderTop: "1px solid var(--rule)",
                      fontSize: 15,
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <Link to={it.to}>{it.label}</Link>
                    <span
                      className="mono"
                      style={{ color: "var(--ink-3)", fontSize: 11 }}
                    >
                      &rarr;
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ——— Footer ——— */}
      <footer
        style={{
          padding: "40px 0 28px",
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          gap: 40,
        }}
      >
        <div>
          <div
            className="serif"
            style={{ fontSize: 28, fontStyle: "italic" }}
          >
            Reduced Recipes
          </div>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginTop: 6,
            }}
          >
            Recipes, reduced. &middot; &copy; 2026
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 13,
              color: "var(--ink-2)",
              maxWidth: 420,
            }}
          >
            An index of recipes, cleaned of SEO sediment. No email capture. No
            &ldquo;jump to recipe&rdquo; button — you were always there.
          </div>
        </div>
        {(
          [
            ["Index", [
              { label: "Browse", to: "/search" },
              { label: "Search", to: "/search" },
              { label: "Collections", to: "/saved" },
              { label: "Random", to: "/search" },
            ]],
            ["About", [
              { label: "Manifesto", to: "/about" },
              { label: "How it works", to: "/about" },
              { label: "Request removal", to: "/remove" },
              { label: "Contact", to: "/about" },
            ]],
            ["Tools", [
              { label: "Shopping list", to: "/shopping-lists" },
              { label: "Saved recipes", to: "/saved" },
              { label: "Settings", to: "/settings" },
              { label: "Profile", to: "/profile" },
            ]],
          ] as const
        ).map(([title, links]) => (
          <div key={title}>
            <div
              className="caps"
              style={{ color: "var(--ink-3)", marginBottom: 14 }}
            >
              {title}
            </div>
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 13,
              }}
            >
              {links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    style={{ color: "var(--ink-2)" }}
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
      </footer>

      <div
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--ink-3)",
          textAlign: "center",
          padding: "0 0 16px",
          borderTop: "1px solid var(--rule)",
          paddingTop: 12,
        }}
      >
        <a
          href="https://www.flaticon.com/free-icons/wireframe"
          title="wireframe icons"
          style={{ color: "var(--ink-3)" }}
          target="_blank"
          rel="noopener noreferrer"
        >
          Wireframe icons created by Pixel perfect - Flaticon
        </a>
      </div>
    </main>
  );
}
