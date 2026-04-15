import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/voice", () => ({
  speak: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  isSpeaking: vi.fn().mockResolvedValue(false),
}));

vi.mock("react", () => ({
  useState: vi.fn((init: unknown) => [init, vi.fn()]),
  useCallback: vi.fn((fn: unknown) => fn),
  useRef: vi.fn(() => ({ current: null })),
  useEffect: vi.fn((fn: () => void) => fn()),
}));

import { useVoiceGuidance } from "../useVoiceGuidance";

describe("useVoiceGuidance", () => {
  it("exports a function", () => {
    expect(typeof useVoiceGuidance).toBe("function");
  });

  it("returns expected shape", () => {
    const result = useVoiceGuidance();
    expect(result).toHaveProperty("speakStep");
    expect(result).toHaveProperty("stopSpeaking");
    expect(result).toHaveProperty("isSpeaking");
    expect(typeof result.speakStep).toBe("function");
    expect(typeof result.stopSpeaking).toBe("function");
    expect(result.isSpeaking).toBe(false);
  });
});
