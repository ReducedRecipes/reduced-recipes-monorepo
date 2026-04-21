import { useState, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useSearch } from "../hooks/useSearch";
import type { SearchMode } from "../hooks/useSearch";
import { useRecipes } from "../hooks/useRecipes";
import { useHealth } from "../hooks/useHealth";
import { Ticker } from "../components/design-system";
import type { RecipeSummary } from "@rr/shared";

const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: "keyword", label: "Keyword" },
  { value: "semantic", label: "Semantic" },
  { value: "hybrid", label: "Hybrid" },
];

const TIME_OPTIONS = [
  { value: 15, label: "≤ 15 Min" },
  { value: 30, label: "≤ 30 Min" },
  { value: 60, label: "≤ 1 Hour" },
  { value: 180, label: "≤ 3 Hours" },
] as const;

const DIET_OPTIONS = ["vegetarian", "vegan", "keto", "gluten-free"];
const METHOD_OPTIONS = ["one-pan", "one-pot", "sheet-pan", "slow-cook", "no-cook"];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "hot", label: "Hot" },
  { value: "top", label: "Top" },
  { value: "quickest", label: "Time (low to high)" },
  { value: "slowest", label: "Time (high to low)" },
  { value: "a-z", label: "A → Z" },
  { value: "z-a", label: "Z → A" },
] as const;

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid var(--rule)" }}>
      <div className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-2)", marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", textAlign: "left" }}>
      <div style={{
        width: 14, height: 14,
        border: `1px solid ${checked ? "var(--ink)" : "var(--rule-2)"}`,
        background: checked ? "var(--ink)" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--bg)", fontSize: 10, flexShrink: 0,
      }}>
        {checked && "✓"}
      </div>
      <span style={{ fontSize: 13, color: checked ? "var(--ink)" : "var(--ink-2)", textTransform: "capitalize" }}>
        {label}
      </span>
    </button>
  );
}

function SearchResultCard({ recipe, highlight }: { recipe: RecipeSummary; highlight: string }) {
  const highlightText = (text: string) => {
    if (!highlight.trim() || !text) return text;
    try {
      const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi"));
      return parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase()
          ? <mark key={i} style={{ background: "var(--accent)", color: "#fff", padding: "0 2px" }}>{part}</mark>
          : part
      );
    } catch {
      return text;
    }
  };

  return (
    <Link
      to={`/recipe/${recipe.id}`}
      style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 10, transition: "all 120ms ease", textDecoration: "none", color: "inherit" }}
    >
      <div style={{ position: "relative" }}>
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt={recipe.title}
            style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", border: "1px solid var(--rule-2)" }}
            loading="lazy"
          />
        ) : (
          <div style={{
            aspectRatio: "4/3", border: "1px solid var(--rule-2)", padding: "16px 14px",
            background: "var(--bg-2)", display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", color: "var(--ink-3)", letterSpacing: "0.06em" }}>
              § {recipe.domain}
            </div>
            <div className="serif" style={{ fontSize: 24, lineHeight: 1.1, fontStyle: "italic", color: "var(--ink)" }}>
              {recipe.title}
            </div>
          </div>
        )}
        {recipe.total_time && (
          <div className="mono" style={{
            position: "absolute", top: 8, right: 8, background: "var(--bg)", color: "var(--ink-2)",
            fontSize: 10, padding: "3px 6px", border: "1px solid var(--rule-2)",
          }}>
            {recipe.total_time}m
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="serif" style={{ fontSize: 20, letterSpacing: "-0.01em", lineHeight: 1.15 }}>
          {highlightText(recipe.title)}
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.04em", textTransform: "uppercase", marginTop: 2 }}>
          {recipe.domain}
          {recipe.cuisine && <> · {recipe.cuisine}</>}
        </div>
      </div>
    </Link>
  );
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const inputRef = useRef<HTMLInputElement>(null);
  const [showFilters, setShowFilters] = useState(false);
  const { health } = useHealth();

  // Derive filter state from URL params (single source of truth)
  const maxTimeParam = searchParams.get("max_time");
  const dietParam = searchParams.get("diet");
  const methodParam = searchParams.get("method");
  const sortBy = searchParams.get("sort") || "newest";
  const modeParam = searchParams.get("mode");
  const searchMode: SearchMode = (modeParam === "keyword" || modeParam === "semantic" || modeParam === "hybrid") ? modeParam : "hybrid";

  const filters = {
    maxTime: maxTimeParam ? parseInt(maxTimeParam, 10) : null as number | null,
    diet: dietParam ? dietParam.split(",").filter(Boolean) : [] as string[],
    method: methodParam ? methodParam.split(",").filter(Boolean) : [] as string[],
  };

  const isSearching = q.length >= 2;

  // Build tags filter from diet + method
  const tagFilters = [...filters.diet, ...filters.method];

  const {
    data: searchData,
    isLoading: searchLoading,
    hasNextPage: searchHasNext,
    fetchNextPage: searchFetchNext,
    isFetchingNextPage: searchFetchingNext,
  } = useSearch(isSearching ? q : "", searchMode);

  const {
    data: browseData,
    isLoading: browseLoading,
    hasNextPage: browseHasNext,
    fetchNextPage: browseFetchNext,
    isFetchingNextPage: browseFetchingNext,
  } = useRecipes({
    limit: 24,
    ...(filters.maxTime ? { max_time: filters.maxTime } : {}),
    ...(tagFilters.length === 1 ? { tag: tagFilters[0] } : {}),
    ...(tagFilters.length > 1 ? { tags: tagFilters.join(",") } : {}),
    sort: sortBy,
  });

  const data = isSearching ? searchData : browseData;
  const isLoading = isSearching ? searchLoading : browseLoading;
  const hasNextPage = isSearching ? searchHasNext : browseHasNext;
  const fetchNextPage = isSearching ? searchFetchNext : browseFetchNext;
  const isFetchingNextPage = isSearching ? searchFetchingNext : browseFetchingNext;

  const recipes = data?.pages.flatMap((p) => p.items) ?? [];

  // Helper: update URL params to reflect filter changes
  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setSearchParams(next, { replace: true });
  };

  const toggleFilter = (category: "maxTime" | "diet" | "method", value: string | number) => {
    if (category === "maxTime") {
      updateParams({ max_time: filters.maxTime === value ? null : String(value) });
    } else {
      const current = filters[category];
      const strVal = String(value);
      const updated = current.includes(strVal)
        ? current.filter((x) => x !== strVal)
        : [...current, strVal];
      updateParams({ [category]: updated.length > 0 ? updated.join(",") : null });
    }
  };

  const setSortByParam = (val: string) => {
    updateParams({ sort: val === "newest" ? null : val });
  };

  const clearFilters = () => {
    updateParams({ max_time: null, diet: null, method: null, sort: null, mode: null });
  };

  const setSearchModeParam = (val: SearchMode) => {
    updateParams({ mode: val === "hybrid" ? null : val });
  };

  const activeFilterCount = [filters.maxTime, ...filters.diet, ...filters.method].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;
  const totalRecipes = health?.total_recipes ?? 0;

  return (
    <main style={{ minHeight: "80vh" }}>
      {/* Hero search bar */}
      <section style={{ padding: "60px 24px 50px", borderBottom: "1px solid var(--rule)", background: "var(--bg-2)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div className="caps" style={{ color: "var(--accent-ink)", marginBottom: 12 }}>◆ Search Index</div>
          <h1 className="serif" style={{
            fontSize: "clamp(48px, 6vw, 72px)", fontStyle: "italic", lineHeight: 0.95,
            letterSpacing: "-0.02em", margin: "0 0 28px", fontWeight: 400,
          }}>
            {q.trim() ? `"${q}"` : `Search ${totalRecipes > 0 ? totalRecipes.toLocaleString() : ""} recipes`}
          </h1>

          <form onSubmit={(e) => e.preventDefault()} style={{ position: "relative" }}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setSearchParams(e.target.value ? { q: e.target.value } : {})}
              placeholder="Recipe name, ingredient, cuisine, or tag..."
              autoFocus
              style={{
                width: "100%", fontSize: 20, padding: "18px 20px",
                border: "2px solid var(--ink)", background: "var(--bg)",
                outline: "none", fontFamily: "var(--sans)",
              }}
            />
            {q && (
              <button
                onClick={() => { setSearchParams({}); inputRef.current?.focus(); }}
                className="mono"
                style={{
                  position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
                  fontSize: 11, padding: "6px 10px", border: "1px solid var(--rule-2)",
                  background: "var(--bg-2)", textTransform: "uppercase", letterSpacing: "0.08em",
                }}
              >
                Clear
              </button>
            )}
          </form>

          {/* Search mode toggle */}
          <div style={{ marginTop: 14, display: "flex", gap: 6, alignItems: "center" }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 4 }}>Mode</span>
            {SEARCH_MODES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => updateParams({ mode: value === "hybrid" ? null : value })}
                className="mono"
                style={{
                  fontSize: 11, padding: "5px 12px", letterSpacing: "0.06em",
                  textTransform: "uppercase", border: "1px solid",
                  borderColor: searchMode === value ? "var(--ink)" : "var(--rule-2)",
                  background: searchMode === value ? "var(--ink)" : "transparent",
                  color: searchMode === value ? "var(--bg)" : "var(--ink-3)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
              <span style={{ color: "var(--ink)" }}>
                <Ticker value={recipes.length} />
              </span>{" "}results
              {q && <> for <b>&ldquo;{q}&rdquo;</b></>}
              {activeFilterCount > 0 && <> · {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active</>}
            </div>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="mono" style={{
                fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em",
                padding: "6px 10px", border: "1px solid var(--rule-2)", color: "var(--ink-2)",
              }}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Mobile filter toggle */}
      <div className="sm:hidden" style={{ padding: "12px 0" }}>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="mono"
          style={{
            fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em",
            padding: "10px 16px", border: "1px solid var(--rule-2)", width: "100%",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}
        >
          <span>Filters {hasActiveFilters ? `(${activeFilterCount})` : ""}</span>
          <span>{showFilters ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* Filters + Results */}
      <section style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 32, padding: "40px 0", alignItems: "start" }} className="search-grid">
        {/* Filter sidebar — hidden on mobile unless toggled */}
        <aside style={{ position: "sticky", top: 170, alignSelf: "start", zIndex: 5 }} className={`filter-sidebar ${showFilters ? "" : "hidden-mobile"}`}>
          <div className="caps" style={{ marginBottom: 18, color: "var(--ink-3)" }}>— Refine by</div>

          <FilterGroup title="Maximum time">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {TIME_OPTIONS.map(({ value, label }) => (
                <Checkbox key={value} label={label} checked={filters.maxTime === value} onChange={() => toggleFilter("maxTime", value)} />
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Diet">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {DIET_OPTIONS.map((d) => (
                <Checkbox key={d} label={d} checked={filters.diet.includes(d)} onChange={() => toggleFilter("diet", d)} />
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Method">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {METHOD_OPTIONS.map((m) => (
                <Checkbox key={m} label={m} checked={filters.method.includes(m)} onChange={() => toggleFilter("method", m)} />
              ))}
            </div>
          </FilterGroup>
        </aside>

        {/* Results */}
        <div>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 20, paddingBottom: 14, borderBottom: "1px solid var(--rule)",
          }}>
            <div className="caps" style={{ color: "var(--ink-3)" }}>Results</div>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              {isSearching && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid var(--rule-2)" }}>
                  {(["keyword", "hybrid", "semantic"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setSearchModeParam(m)}
                      className="mono"
                      style={{
                        fontSize: 10, padding: "5px 9px", textTransform: "uppercase",
                        letterSpacing: "0.08em", border: "none",
                        background: searchMode === m ? "var(--ink)" : "var(--bg)",
                        color: searchMode === m ? "var(--bg)" : "var(--ink-3)",
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Sort by</span>
              <select
                value={sortBy}
                onChange={(e) => setSortByParam(e.target.value)}
                className="mono"
                style={{
                  fontSize: 11, padding: "6px 10px", border: "1px solid var(--rule-2)",
                  background: "var(--bg)", textTransform: "uppercase", letterSpacing: "0.06em",
                }}
              >
                {SORT_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {isLoading ? (
            <div style={{ padding: "80px 40px", textAlign: "center" }}>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Loading…</div>
            </div>
          ) : recipes.length === 0 ? (
            <div style={{ padding: "80px 40px", textAlign: "center", border: "1px dashed var(--rule-2)" }}>
              <div className="serif" style={{ fontSize: 36, fontStyle: "italic", color: "var(--ink-3)", marginBottom: 12 }}>
                No recipes found
              </div>
              <div style={{ fontSize: 15, color: "var(--ink-2)" }}>
                Try adjusting your filters or search term.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 24 }}>
                {recipes.map((r) => (
                  <SearchResultCard key={r.id} recipe={r} highlight={q.toLowerCase()} />
                ))}
              </div>
              {hasNextPage && (
                <div style={{ marginTop: 32, textAlign: "center" }}>
                  <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="mono"
                    style={{
                      fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em",
                      padding: "10px 24px", border: "1px solid var(--ink)",
                      background: isFetchingNextPage ? "var(--bg-2)" : "var(--bg)",
                      color: "var(--ink)",
                    }}
                  >
                    {isFetchingNextPage ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
