import { describe, it, expect, vi } from "vitest";

vi.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: vi.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: vi.fn(),
}));

vi.mock("../../stores/cooking.store", () => ({
  useCookingStore: vi.fn(() => ({
    session: {
      recipeId: "r1",
      currentStep: 0,
      totalSteps: 3,
      startedAt: new Date(),
      timerRunning: false,
      timerRemaining: 0,
    },
    startSession: vi.fn(),
    endSession: vi.fn(),
    nextStep: vi.fn(),
    prevStep: vi.fn(),
    startTimer: vi.fn(),
    pauseTimer: vi.fn(),
    tickTimer: vi.fn(),
  })),
}));

vi.mock("react", () => ({
  useEffect: vi.fn((fn: () => void) => fn()),
  useRef: vi.fn(() => ({ current: null })),
}));

import { useCookingSession } from "../useCookingSession";

describe("useCookingSession", () => {
  it("exports a function", () => {
    expect(typeof useCookingSession).toBe("function");
  });

  it("returns expected shape", () => {
    const result = useCookingSession("r1", ["step1", "step2", "step3"]);
    expect(result).toHaveProperty("currentStep");
    expect(result).toHaveProperty("totalSteps");
    expect(result).toHaveProperty("nextStep");
    expect(result).toHaveProperty("prevStep");
    expect(result).toHaveProperty("startTimer");
    expect(result).toHaveProperty("pauseTimer");
    expect(result).toHaveProperty("timerRemaining");
    expect(result).toHaveProperty("timerRunning");
    expect(result).toHaveProperty("endSession");
  });

  it("returns correct values from store session", () => {
    const result = useCookingSession("r1", ["step1", "step2", "step3"]);
    expect(result.currentStep).toBe(0);
    expect(result.totalSteps).toBe(3);
    expect(result.timerRunning).toBe(false);
    expect(result.timerRemaining).toBe(0);
  });
});
