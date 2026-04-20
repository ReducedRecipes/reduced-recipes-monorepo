import { Link, useLocation, useNavigate } from "react-router-dom";
import Ticker from "./Ticker";
import { LoginButton } from "./LoginButton";
import { useAuth } from "../hooks/useAuth";

const SECTIONS = [
  { label: "00 — Index", path: "/" },
  { label: "01 — Browse", path: "/search" },
  { label: "02 — Recipe", path: "/recipe" },
  { label: "03 — Manifesto", path: "/about" },
] as const;

interface TopBarProps {
  recipeCount?: number;
}

export default function TopBar({ recipeCount = 0 }: TopBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const activeSection = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const handleSearch = () => {
    navigate("/search");
  };

  return (
    <header className="sticky top-0 z-10 border-b border-rule bg-bg" data-no-print>
      {/* Row 1: Utility strip */}
      <div className="border-b border-rule">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5">
          <span className="text-caps font-mono text-ink-3">EST. 2024</span>
          <span className="text-caps font-mono text-ink-3">
            <Ticker value={recipeCount} className="text-ink-2" /> recipes indexed
          </span>
          <span className="hidden text-caps font-mono text-ink-3 sm:block">
            Recipes, reduced to what matters.
          </span>
          <span className="text-caps font-mono text-ink-3">v1.0 / Issue 01</span>
        </div>
      </div>

      {/* Row 2: Masthead */}
      <div className="border-b border-rule">
        <div className="mx-auto grid max-w-7xl grid-cols-3 items-center px-4 py-3">
          {/* Left nav */}
          <nav className="flex gap-5 text-sm text-ink-2">
            <Link to="/search" className="transition-colors hover:text-ink">
              Browse
            </Link>
            <Link to="/search?q=ingredients" className="transition-colors hover:text-ink">
              Ingredients
            </Link>
            {isAuthenticated && (
              <Link to="/saved" className="transition-colors hover:text-ink">
                Collections
              </Link>
            )}
          </nav>

          {/* Center brand */}
          <Link to="/" className="flex flex-col items-center">
            <span className="font-serif text-2xl italic text-ink">Reduced</span>
            <span className="text-caps font-mono tracking-[0.25em] text-ink-2">
              RECIPES
            </span>
          </Link>

          {/* Right: search + login */}
          <div className="flex items-center justify-end gap-4">
            <button
              onClick={handleSearch}
              className="flex items-center gap-1.5 rounded border border-rule px-3 py-1.5 text-sm text-ink-3 transition-colors hover:border-ink-3 hover:text-ink-2"
            >
              Search
              <kbd className="ml-1 rounded border border-rule bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                ⌘K
              </kbd>
            </button>
            <LoginButton />
          </div>
        </div>
      </div>

      {/* Row 3: Section nav */}
      <div className="mx-auto max-w-7xl px-4">
        <nav className="flex gap-0">
          {SECTIONS.map((section) => (
            <Link
              key={section.path}
              to={section.path}
              className={`border-b-2 px-4 py-2.5 font-mono text-xs uppercase tracking-wider transition-colors ${
                activeSection(section.path)
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-3 hover:text-ink-2"
              }`}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
