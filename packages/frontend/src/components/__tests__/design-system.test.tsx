import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Ticker,
  Rule,
  Stat,
  Pill,
  FoodPlaceholder,
  TextThumb,
  TextHeroCard,
} from "../design-system";

afterEach(cleanup);

describe("Ticker", () => {
  it("renders a number with mono class", () => {
    render(<Ticker value={1000} />);
    const el = screen.getByText(/\d/);
    expect(el.className).toBe("mono");
  });
});

describe("Rule", () => {
  it("renders without label", () => {
    const { container } = render(<Rule />);
    expect(container.firstChild).toBeDefined();
  });

  it("renders with label in caps class", () => {
    render(<Rule label="Section" />);
    const label = screen.getByText("Section");
    expect(label.className).toContain("caps");
  });
});

describe("Stat", () => {
  it("renders key and value", () => {
    render(<Stat k="Total" v="25" sub="min" />);
    expect(screen.getByText("Total")).toBeDefined();
    expect(screen.getByText(/25/)).toBeDefined();
    expect(screen.getByText(/min/)).toBeDefined();
  });

  it("renders without sub", () => {
    render(<Stat k="Steps" v={7} />);
    expect(screen.getByText("Steps")).toBeDefined();
    expect(screen.getByText("7")).toBeDefined();
  });
});

describe("Pill", () => {
  it("renders children and applies mono class", () => {
    render(<Pill>Filter</Pill>);
    const btn = screen.getByRole("button", { name: "Filter" });
    expect(btn.className).toContain("mono");
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Pill onClick={() => (clicked = true)}>Click</Pill>);
    await user.click(screen.getByRole("button", { name: "Click" }));
    expect(clicked).toBe(true);
  });

  it("applies active styling", () => {
    render(<Pill active>Active</Pill>);
    const btn = screen.getByRole("button", { name: "Active" });
    expect(btn.style.background).toBe("var(--ink)");
    expect(btn.style.color).toBe("var(--bg)");
  });
});

describe("FoodPlaceholder", () => {
  it("renders label text", () => {
    render(<FoodPlaceholder label="Pasta" />);
    expect(screen.getByText(/Pasta/)).toBeDefined();
  });

  it("uses warm tone by default", () => {
    const { container } = render(<FoodPlaceholder label="Test" />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.background).toContain("oklch(0.9 0.02 70)");
  });

  it("uses cool tone when specified", () => {
    const { container } = render(
      <FoodPlaceholder label="Test" tone="cool" />
    );
    const div = container.firstChild as HTMLElement;
    expect(div.style.background).toContain("oklch(0.88");
  });
});

describe("TextThumb", () => {
  const recipe = { id: "test-recipe", title: "Pasta Carbonara", time: 30, reviews: 150 };

  it("renders recipe title", () => {
    render(<TextThumb recipe={recipe} />);
    expect(screen.getByText("Pasta")).toBeDefined();
  });

  it("renders time and review count", () => {
    render(<TextThumb recipe={recipe} />);
    expect(screen.getByText("30m")).toBeDefined();
    expect(screen.getByText("n=150")).toBeDefined();
  });
});

describe("TextHeroCard", () => {
  const recipe = {
    id: "tuscan-chicken",
    ingredients: [
      { qty: 2, unit: "lbs", item: "chicken thighs" },
      { qty: 1, unit: "cup", item: "cream" },
    ],
    steps: [
      { t: 0, text: "Season the chicken with salt and pepper on both sides" },
      { t: 5, text: "Sear in a hot pan until golden brown" },
    ],
  };

  it("renders recipe file name", () => {
    render(<TextHeroCard recipe={recipe} />);
    expect(screen.getByText("// tuscan-chicken.recipe")).toBeDefined();
  });

  it("renders ingredients section", () => {
    render(<TextHeroCard recipe={recipe} />);
    expect(screen.getByText(/chicken thighs/)).toBeDefined();
  });

  it("returns null for falsy recipe", () => {
    const { container } = render(
      <TextHeroCard recipe={null as unknown as typeof recipe} />
    );
    expect(container.innerHTML).toBe("");
  });
});
