import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RecipeGrid from "../RecipeGrid";

// Mock IntersectionObserver for test environment
beforeAll(() => {
  globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

afterEach(cleanup);

const items = [
  { id: "r1", title: "Pasta Carbonara", domain: "example.com", image_url: null, total_time: 30 },
  { id: "r2", title: "Chicken Tikka", domain: "food.com", image_url: null, total_time: 45 },
] as any[];

function renderGrid(props: Partial<Parameters<typeof RecipeGrid>[0]> = {}) {
  return render(
    <MemoryRouter>
      <RecipeGrid
        items={items}
        hasNextPage={false}
        fetchNextPage={vi.fn()}
        isFetchingNextPage={false}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("RecipeGrid", () => {
  it("renders recipe cards", () => {
    renderGrid();
    expect(screen.getByText("Pasta Carbonara")).toBeDefined();
    expect(screen.getByText("Chicken Tikka")).toBeDefined();
  });

  it("shows empty message when no items", () => {
    renderGrid({ items: [] });
    expect(screen.getByText("No recipes found")).toBeDefined();
  });

  it("shows custom empty message", () => {
    renderGrid({ items: [], emptyMessage: "Nothing here" });
    expect(screen.getByText("Nothing here")).toBeDefined();
  });

  it("uses IntersectionObserver for infinite scroll when hasNextPage", () => {
    renderGrid({ hasNextPage: true });
    expect(IntersectionObserver).toHaveBeenCalled();
  });

  it("does not render loading text when not fetching", () => {
    renderGrid({ hasNextPage: true, isFetchingNextPage: false });
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("shows Loading text when fetching next page", () => {
    renderGrid({ hasNextPage: true, isFetchingNextPage: true });
    expect(screen.getByText("Loading…")).toBeDefined();
  });
});
