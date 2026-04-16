import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSpeak, mockStop, mockIsSpeakingAsync } = vi.hoisted(() => ({
  mockSpeak: vi.fn(),
  mockStop: vi.fn(),
  mockIsSpeakingAsync: vi.fn(),
}));

vi.mock("expo-speech", () => ({
  speak: mockSpeak,
  stop: mockStop,
  isSpeakingAsync: mockIsSpeakingAsync,
}));

import { speak, stop, isSpeaking } from "../voice";

describe("speak", () => {
  beforeEach(() => {
    mockSpeak.mockReset();
    mockStop.mockReset();
    mockIsSpeakingAsync.mockReset();
  });

  it("calls Speech.speak with default options", async () => {
    await speak("Hello");
    expect(mockSpeak).toHaveBeenCalledWith("Hello", {
      language: "en-US",
      pitch: 1.0,
      rate: 0.9,
    });
  });

  it("passes custom options", async () => {
    await speak("Bonjour", { language: "fr-FR", pitch: 1.2, rate: 0.8 });
    expect(mockSpeak).toHaveBeenCalledWith("Bonjour", {
      language: "fr-FR",
      pitch: 1.2,
      rate: 0.8,
    });
  });

  it("catches errors silently", async () => {
    mockSpeak.mockImplementationOnce(() => {
      throw new Error("Speech unavailable");
    });
    await expect(speak("test")).resolves.toBeUndefined();
  });
});

describe("stop", () => {
  beforeEach(() => {
    mockStop.mockReset();
  });

  it("calls Speech.stop", () => {
    stop();
    expect(mockStop).toHaveBeenCalled();
  });

  it("catches errors silently", () => {
    mockStop.mockImplementationOnce(() => {
      throw new Error("Not available");
    });
    expect(() => stop()).not.toThrow();
  });
});

describe("isSpeaking", () => {
  beforeEach(() => {
    mockIsSpeakingAsync.mockReset();
  });

  it("returns true when speaking", async () => {
    mockIsSpeakingAsync.mockResolvedValueOnce(true);
    expect(await isSpeaking()).toBe(true);
  });

  it("returns false when not speaking", async () => {
    mockIsSpeakingAsync.mockResolvedValueOnce(false);
    expect(await isSpeaking()).toBe(false);
  });

  it("returns false on error", async () => {
    mockIsSpeakingAsync.mockRejectedValueOnce(new Error("Fail"));
    expect(await isSpeaking()).toBe(false);
  });
});
