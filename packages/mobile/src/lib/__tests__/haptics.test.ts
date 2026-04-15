import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockImpactAsync } = vi.hoisted(() => ({
  mockImpactAsync: vi.fn(),
}));

vi.mock("expo-haptics", () => ({
  impactAsync: mockImpactAsync,
  ImpactFeedbackStyle: {
    Light: "light" as const,
    Medium: "medium" as const,
    Heavy: "heavy" as const,
  },
}));

import { triggerHaptic } from "../haptics";

describe("triggerHaptic", () => {
  beforeEach(() => {
    mockImpactAsync.mockReset();
  });

  it("calls impactAsync with Medium style by default", async () => {
    await triggerHaptic();
    expect(mockImpactAsync).toHaveBeenCalledWith("medium");
  });

  it("calls impactAsync with Light style", async () => {
    await triggerHaptic("light");
    expect(mockImpactAsync).toHaveBeenCalledWith("light");
  });

  it("calls impactAsync with Heavy style", async () => {
    await triggerHaptic("heavy");
    expect(mockImpactAsync).toHaveBeenCalledWith("heavy");
  });

  it("catches errors silently on unsupported devices", async () => {
    mockImpactAsync.mockRejectedValueOnce(new Error("Not supported"));
    await expect(triggerHaptic("light")).resolves.toBeUndefined();
  });
});
