import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RecipeGrid from "../RecipeGrid";

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

  it("shows Load More button when hasNextPage", () => {
    const fetchNextPage = vi.fn();
    renderGrid({ hasNextPage: true, fetchNextPage });
    const button = screen.getByText("Load More");
    expect(button).toBeDefined();
    fireEvent.click(button);
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it("hides Load More button when no next page", () => {
    renderGrid({ hasNextPage: false });
    expect(screen.queryByText("Load More")).toBeNull();
  });

  it("shows Loading... text when fetching next page", () => {
    renderGrid({ hasNextPage: true, isFetchingNextPage: true });
    expect(screen.getByText("Loading...")).toBeDefined();
  });
});
