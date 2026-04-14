import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FilterBar from "../FilterBar";

afterEach(cleanup);

const sampleTags = [
  { tag: "pasta", count: 10 },
  { tag: "soup", count: 5 },
  { tag: "salad", count: 3 },
];

describe("FilterBar", () => {
  it("renders tag chips", () => {
    const onChange = vi.fn();
    render(<FilterBar tags={sampleTags} onFilterChange={onChange} />);
    expect(screen.getByText("pasta (10)")).toBeDefined();
    expect(screen.getByText("soup (5)")).toBeDefined();
    expect(screen.getByText("salad (3)")).toBeDefined();
  });

  it("calls onFilterChange when a tag is clicked", () => {
    const onChange = vi.fn();
    render(<FilterBar tags={sampleTags} onFilterChange={onChange} />);
    fireEvent.click(screen.getByText("pasta (10)"));
    expect(onChange).toHaveBeenCalledWith({ tag: "pasta" });
  });

  it("deselects active tag when clicked again", () => {
    const onChange = vi.fn();
    render(
      <FilterBar tags={sampleTags} activeTag="pasta" onFilterChange={onChange} />
    );
    fireEvent.click(screen.getByText("pasta (10)"));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("shows clear filter button when a tag is active", () => {
    const onChange = vi.fn();
    render(
      <FilterBar tags={sampleTags} activeTag="pasta" onFilterChange={onChange} />
    );
    const clearBtn = screen.getByText("Clear filters");
    expect(clearBtn).toBeDefined();
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("does not show clear filter button when no filters active", () => {
    const onChange = vi.fn();
    render(<FilterBar tags={sampleTags} onFilterChange={onChange} />);
    expect(screen.queryByText("Clear filters")).toBeNull();
  });

  it("highlights the active tag chip", () => {
    const onChange = vi.fn();
    render(
      <FilterBar tags={sampleTags} activeTag="soup" onFilterChange={onChange} />
    );
    const soupBtn = screen.getByText("soup (5)");
    expect(soupBtn.className).toContain("bg-blue-600");
    const pastaBtn = screen.getByText("pasta (10)");
    expect(pastaBtn.className).toContain("bg-gray-100");
  });

  it("renders cuisine dropdown when cuisines provided", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        tags={sampleTags}
        cuisines={["Italian", "Mexican"]}
        onFilterChange={onChange}
      />
    );
    expect(screen.getByText("All cuisines")).toBeDefined();
    expect(screen.getByText("Italian")).toBeDefined();
    expect(screen.getByText("Mexican")).toBeDefined();
  });

  it("does not render cuisine dropdown when no cuisines", () => {
    const onChange = vi.fn();
    render(<FilterBar tags={sampleTags} onFilterChange={onChange} />);
    expect(screen.queryByText("All cuisines")).toBeNull();
  });
});
