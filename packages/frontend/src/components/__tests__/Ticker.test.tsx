import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import Ticker from "../Ticker";

afterEach(cleanup);

describe("Ticker", () => {
  it("renders with initial value of 0", () => {
    render(<Ticker value={0} />);
    expect(screen.getByText("0")).toBeDefined();
  });

  it("applies custom className", () => {
    render(<Ticker value={0} className="text-red-500" />);
    const el = screen.getByText("0");
    expect(el.className).toContain("text-red-500");
  });

  it("has aria-live polite for accessibility", () => {
    render(<Ticker value={0} />);
    const el = screen.getByText("0");
    expect(el.getAttribute("aria-live")).toBe("polite");
  });

  it("uses monospace font class", () => {
    render(<Ticker value={0} />);
    const el = screen.getByText("0");
    expect(el.className).toContain("font-mono");
  });
});
