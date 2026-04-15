import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import NotFoundPage from "../NotFoundPage";

import { afterEach } from "vitest";
afterEach(cleanup);

describe("NotFoundPage", () => {
  it("renders the 'Page not found' heading", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
    expect(screen.getByText("Page not found")).toBeDefined();
  });

  it("renders a link back to homepage with href='/'", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    const homeLink = screen.getByText("Go back to homepage");
    expect(homeLink.closest("a")?.getAttribute("href")).toBe("/");
  });
});
