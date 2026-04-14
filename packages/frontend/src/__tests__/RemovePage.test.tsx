import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../lib/api", () => ({
  submitRemoval: vi.fn(),
}));

import { submitRemoval } from "../lib/api";
import RemovePage from "../pages/RemovePage";

const mockedSubmit = vi.mocked(submitRemoval);

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RemovePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RemovePage", () => {
  it("renders the form with required fields", () => {
    renderPage();
    expect(screen.getByLabelText("Recipe URL")).toBeDefined();
    expect(screen.getByLabelText("Your Email")).toBeDefined();
    expect(screen.getByLabelText("Reason (optional)")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Submit Removal Request" }),
    ).toBeDefined();
  });

  it("shows success message after submission", async () => {
    mockedSubmit.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByLabelText("Recipe URL"), "https://example.com/recipe");
    await user.type(screen.getByLabelText("Your Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Submit Removal Request" }));

    expect(
      await screen.findByText(/Your removal request has been submitted/),
    ).toBeDefined();
  });

  it("shows error message on failure", async () => {
    mockedSubmit.mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByLabelText("Recipe URL"), "https://example.com/recipe");
    await user.type(screen.getByLabelText("Your Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Submit Removal Request" }));

    expect(await screen.findByText("Server error")).toBeDefined();
  });
});
