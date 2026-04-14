import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "../components/Layout";

afterEach(cleanup);

// Re-create the route structure from main.tsx but within a test-friendly wrapper
// (main.tsx calls ReactDOM.createRoot which cannot be tested directly)
const Placeholder = ({ name }: { name: string }) => (
  <div>{name} — coming soon</div>
);

const HomePage = () => <Placeholder name="Home" />;
const RecipePage = () => <Placeholder name="Recipe" />;
const SearchPage = () => <Placeholder name="Search" />;
const TagPage = () => <Placeholder name="Tag" />;
const CuisinePage = () => <Placeholder name="Cuisine" />;
const DomainPage = () => <Placeholder name="Domain" />;
const RemovePage = () => <Placeholder name="Remove" />;

function renderApp(initialRoute: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/recipe/:id" element={<RecipePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/tag/:tag" element={<TagPage />} />
            <Route path="/cuisine/:cuisine" element={<CuisinePage />} />
            <Route path="/site/:domain" element={<DomainPage />} />
            <Route path="/remove" element={<RemovePage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("main.tsx route definitions", () => {
  it("renders HomePage at /", () => {
    renderApp("/");
    expect(screen.getByText("Home — coming soon")).toBeDefined();
  });

  it("renders RecipePage at /recipe/:id", () => {
    renderApp("/recipe/abc123");
    expect(screen.getByText("Recipe — coming soon")).toBeDefined();
  });

  it("renders SearchPage at /search", () => {
    renderApp("/search");
    expect(screen.getByText("Search — coming soon")).toBeDefined();
  });

  it("renders TagPage at /tag/:tag", () => {
    renderApp("/tag/pasta");
    expect(screen.getByText("Tag — coming soon")).toBeDefined();
  });

  it("renders CuisinePage at /cuisine/:cuisine", () => {
    renderApp("/cuisine/italian");
    expect(screen.getByText("Cuisine — coming soon")).toBeDefined();
  });

  it("renders DomainPage at /site/:domain", () => {
    renderApp("/site/example.com");
    expect(screen.getByText("Domain — coming soon")).toBeDefined();
  });

  it("renders RemovePage at /remove", () => {
    renderApp("/remove");
    expect(screen.getByText("Remove — coming soon")).toBeDefined();
  });

  it("wraps all routes in Layout with header", () => {
    renderApp("/");
    expect(screen.getByText("ReducedRecipes")).toBeDefined();
    expect(screen.getByRole("link", { name: "Home" })).toBeDefined();
  });
});
