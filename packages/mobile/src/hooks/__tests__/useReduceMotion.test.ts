import { describe, it, expect, vi } from "vitest";

const mockRemove = vi.fn();
vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: vi.fn().mockResolvedValue(false),
    addEventListener: vi.fn(() => ({ remove: mockRemove })),
  },
}));

vi.mock("react", () => ({
  useState: vi.fn((init: unknown) => [init, vi.fn()]),
  useEffect: vi.fn((fn: () => () => void) => {
    const cleanup = fn();
    if (typeof cleanup === "function") cleanup();
  }),
}));

import { useReduceMotion } from "../useReduceMotion";
import { AccessibilityInfo } from "react-native";

describe("useReduceMotion", () => {
  it("exports a function", () => {
    expect(typeof useReduceMotion).toBe("function");
  });

  it("returns a boolean", () => {
    const result = useReduceMotion();
    expect(typeof result).toBe("boolean");
  });

  it("checks initial reduce motion state on mount", () => {
    useReduceMotion();
    expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();
  });

  it("subscribes to reduceMotionChanged event", () => {
    useReduceMotion();
    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
      "reduceMotionChanged",
      expect.any(Function),
    );
  });

  it("cleans up subscription on unmount", () => {
    useReduceMotion();
    expect(mockRemove).toHaveBeenCalled();
  });
});
