import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "../useTheme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("useTheme", () => {
  it("defaults to warm theme and does not set data-theme attribute", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("warm");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("reads stored theme from localStorage", () => {
    localStorage.setItem("rr_theme", "cool");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("cool");
  });

  it("sets data-theme attribute when theme changes to cool", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("cool");
    });
    expect(result.current.theme).toBe("cool");
    expect(document.documentElement.getAttribute("data-theme")).toBe("cool");
  });

  it("sets data-theme attribute when theme changes to mono", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("mono");
    });
    expect(result.current.theme).toBe("mono");
    expect(document.documentElement.getAttribute("data-theme")).toBe("mono");
  });

  it("removes data-theme attribute when switching back to warm", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("mono");
    });
    act(() => {
      result.current.setTheme("warm");
    });
    expect(result.current.theme).toBe("warm");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("persists theme choice to localStorage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("mono");
    });
    expect(localStorage.getItem("rr_theme")).toBe("mono");
  });
});
