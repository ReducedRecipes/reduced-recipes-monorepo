import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TopBar from "../TopBar";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    isNewUser: false,
    logout: vi.fn(),
    login: vi.fn(),
    checkAuth: vi.fn(),
  }),
}));

vi.mock("../LoginButton", () => ({ LoginButton: () => null }));

afterEach(cleanup);

function renderTopBar(props = {}, initialRoute = "/") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <TopBar recipeCount={0} {...props} />
    </MemoryRouter>,
  );
}

describe("TopBar", () => {
  describe("Utility strip", () => {
    it("renders EST. 2024", () => {
      renderTopBar();
      expect(screen.getByText("EST. 2024")).toBeDefined();
    });

    it("renders recipe count with ticker", () => {
      renderTopBar({ recipeCount: 42 });
      expect(screen.getByText("recipes indexed")).toBeDefined();
    });

    it("renders version info", () => {
      renderTopBar();
      expect(screen.getByText("v1.0 / Issue 01")).toBeDefined();
    });
  });

  describe("Masthead", () => {
    it("renders the brand with Reduced in serif and RECIPES in mono", () => {
      renderTopBar();
      const reduced = screen.getByText("Reduced");
      expect(reduced.className).toContain("font-serif");
      expect(reduced.className).toContain("italic");

      const recipes = screen.getByText("RECIPES");
      expect(recipes.className).toContain("font-mono");
    });

    it("renders brand link to home", () => {
      renderTopBar();
      const reduced = screen.getByText("Reduced");
      expect(reduced.closest("a")?.getAttribute("href")).toBe("/");
    });

    it("renders Browse nav link", () => {
      renderTopBar();
      expect(screen.getByText("Browse")).toBeDefined();
    });

    it("renders search button with ⌘K shortcut", () => {
      renderTopBar();
      expect(screen.getByText("Search")).toBeDefined();
      expect(screen.getByText("⌘K")).toBeDefined();
    });
  });

  describe("Section nav", () => {
    it("renders all five section tabs", () => {
      renderTopBar();
      expect(screen.getByText("00 — Index")).toBeDefined();
      expect(screen.getByText("01 — Browse")).toBeDefined();
      expect(screen.getByText("02 — Saved")).toBeDefined();
      expect(screen.getByText("03 — Journal")).toBeDefined();
      expect(screen.getByText("04 — Manifesto")).toBeDefined();
    });

    it("highlights Index tab when on home page", () => {
      renderTopBar({}, "/");
      const indexTab = screen.getByText("00 — Index");
      expect(indexTab.className).toContain("border-accent");
    });

    it("highlights Browse tab when on search page", () => {
      renderTopBar({}, "/search");
      const browseTab = screen.getByText("01 — Browse");
      expect(browseTab.className).toContain("border-accent");
    });

    it("highlights Saved tab when on saved page", () => {
      renderTopBar({}, "/saved");
      const savedTab = screen.getByText("02 — Saved");
      expect(savedTab.className).toContain("border-accent");
    });

    it("does not highlight Index when on another page", () => {
      renderTopBar({}, "/search");
      const indexTab = screen.getByText("00 — Index");
      expect(indexTab.className).toContain("border-transparent");
    });
  });

  describe("Sticky behavior", () => {
    it("header has sticky positioning", () => {
      const { container } = renderTopBar();
      const header = container.querySelector("header");
      expect(header?.className).toContain("sticky");
      expect(header?.className).toContain("top-0");
    });
  });
});
