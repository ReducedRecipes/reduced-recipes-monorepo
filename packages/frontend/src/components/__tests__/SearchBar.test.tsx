import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SearchBar from "../SearchBar";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

beforeEach(() => {
  mockNavigate.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderSearchBar() {
  return render(
    <MemoryRouter>
      <SearchBar />
    </MemoryRouter>
  );
}

describe("SearchBar", () => {
  it("renders an input with placeholder", () => {
    renderSearchBar();
    expect(screen.getByPlaceholderText("Search recipes...")).toBeDefined();
  });

  it("navigates after 300ms debounce when typing 2+ characters", () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText("Search recipes...");

    fireEvent.change(input, { target: { value: "pasta" } });
    expect(mockNavigate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(mockNavigate).toHaveBeenCalledWith("/search?q=pasta");
  });

  it("does not navigate when query is less than 2 characters", () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText("Search recipes...");

    fireEvent.change(input, { target: { value: "a" } });
    vi.advanceTimersByTime(500);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates immediately on form submit", () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText("Search recipes...");

    fireEvent.change(input, { target: { value: "soup" } });
    fireEvent.submit(input.closest("form")!);

    expect(mockNavigate).toHaveBeenCalledWith("/search?q=soup");
  });

  it("does not navigate on submit with short query", () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText("Search recipes...");

    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.submit(input.closest("form")!);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("encodes special characters in the query", () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText("Search recipes...");

    fireEvent.change(input, { target: { value: "a&b" } });
    vi.advanceTimersByTime(300);

    expect(mockNavigate).toHaveBeenCalledWith("/search?q=a%26b");
  });

  it("resets debounce timer on new input", () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText("Search recipes...");

    fireEvent.change(input, { target: { value: "pa" } });
    vi.advanceTimersByTime(200);
    expect(mockNavigate).not.toHaveBeenCalled();

    // New input resets the timer
    fireEvent.change(input, { target: { value: "pasta" } });
    vi.advanceTimersByTime(200);
    expect(mockNavigate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(mockNavigate).toHaveBeenCalledWith("/search?q=pasta");
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
});
