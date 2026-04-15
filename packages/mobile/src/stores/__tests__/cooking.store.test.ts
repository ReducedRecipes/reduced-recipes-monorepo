import { describe, it, expect, beforeEach } from "vitest";
import { useCookingStore } from "../cooking.store";

function resetStore() {
  useCookingStore.setState({ session: null });
}

describe("useCookingStore", () => {
  beforeEach(() => {
    resetStore();
  });

  it("starts with no session", () => {
    expect(useCookingStore.getState().session).toBeNull();
  });

  describe("startSession", () => {
    it("initialises a cooking session", () => {
      useCookingStore.getState().startSession("recipe-1", 5);
      const session = useCookingStore.getState().session;
      expect(session).not.toBeNull();
      expect(session!.recipeId).toBe("recipe-1");
      expect(session!.currentStep).toBe(0);
      expect(session!.totalSteps).toBe(5);
      expect(session!.startedAt).toBeInstanceOf(Date);
      expect(session!.timerRunning).toBe(false);
      expect(session!.timerRemaining).toBe(0);
    });
  });

  describe("endSession", () => {
    it("resets session to null", () => {
      useCookingStore.getState().startSession("recipe-1", 5);
      useCookingStore.getState().endSession();
      expect(useCookingStore.getState().session).toBeNull();
    });
  });

  describe("nextStep", () => {
    it("advances the current step", () => {
      useCookingStore.getState().startSession("recipe-1", 5);
      useCookingStore.getState().nextStep();
      expect(useCookingStore.getState().session!.currentStep).toBe(1);
    });

    it("clamps to last step", () => {
      useCookingStore.getState().startSession("recipe-1", 3);
      useCookingStore.getState().nextStep();
      useCookingStore.getState().nextStep();
      useCookingStore.getState().nextStep();
      useCookingStore.getState().nextStep();
      expect(useCookingStore.getState().session!.currentStep).toBe(2);
    });

    it("is a no-op when no session", () => {
      useCookingStore.getState().nextStep();
      expect(useCookingStore.getState().session).toBeNull();
    });
  });

  describe("prevStep", () => {
    it("goes back one step", () => {
      useCookingStore.getState().startSession("recipe-1", 5);
      useCookingStore.getState().nextStep();
      useCookingStore.getState().nextStep();
      useCookingStore.getState().prevStep();
      expect(useCookingStore.getState().session!.currentStep).toBe(1);
    });

    it("clamps to zero", () => {
      useCookingStore.getState().startSession("recipe-1", 5);
      useCookingStore.getState().prevStep();
      expect(useCookingStore.getState().session!.currentStep).toBe(0);
    });

    it("is a no-op when no session", () => {
      useCookingStore.getState().prevStep();
      expect(useCookingStore.getState().session).toBeNull();
    });
  });

  describe("timer", () => {
    it("startTimer sets timer running with given seconds", () => {
      useCookingStore.getState().startSession("recipe-1", 5);
      useCookingStore.getState().startTimer(60);
      const session = useCookingStore.getState().session!;
      expect(session.timerRunning).toBe(true);
      expect(session.timerRemaining).toBe(60);
    });

    it("pauseTimer stops the timer", () => {
      useCookingStore.getState().startSession("recipe-1", 5);
      useCookingStore.getState().startTimer(60);
      useCookingStore.getState().pauseTimer();
      const session = useCookingStore.getState().session!;
      expect(session.timerRunning).toBe(false);
      expect(session.timerRemaining).toBe(60);
    });

    it("tickTimer decrements remaining by 1", () => {
      useCookingStore.getState().startSession("recipe-1", 5);
      useCookingStore.getState().startTimer(3);
      useCookingStore.getState().tickTimer();
      expect(useCookingStore.getState().session!.timerRemaining).toBe(2);
      expect(useCookingStore.getState().session!.timerRunning).toBe(true);
    });

    it("tickTimer stops at zero and pauses", () => {
      useCookingStore.getState().startSession("recipe-1", 5);
      useCookingStore.getState().startTimer(1);
      useCookingStore.getState().tickTimer();
      expect(useCookingStore.getState().session!.timerRemaining).toBe(0);
      expect(useCookingStore.getState().session!.timerRunning).toBe(false);
    });

    it("tickTimer is a no-op when timer is not running", () => {
      useCookingStore.getState().startSession("recipe-1", 5);
      useCookingStore.getState().startTimer(10);
      useCookingStore.getState().pauseTimer();
      useCookingStore.getState().tickTimer();
      expect(useCookingStore.getState().session!.timerRemaining).toBe(10);
    });

    it("tickTimer is a no-op when no session", () => {
      useCookingStore.getState().tickTimer();
      expect(useCookingStore.getState().session).toBeNull();
    });

    it("startTimer is a no-op when no session", () => {
      useCookingStore.getState().startTimer(60);
      expect(useCookingStore.getState().session).toBeNull();
    });

    it("pauseTimer is a no-op when no session", () => {
      useCookingStore.getState().pauseTimer();
      expect(useCookingStore.getState().session).toBeNull();
    });
  });

  describe("session lifecycle", () => {
    it("supports full lifecycle: start → advance → timer → end", () => {
      useCookingStore.getState().startSession("recipe-42", 3);
      useCookingStore.getState().nextStep();
      useCookingStore.getState().startTimer(30);
      useCookingStore.getState().tickTimer();
      expect(useCookingStore.getState().session!.currentStep).toBe(1);
      expect(useCookingStore.getState().session!.timerRemaining).toBe(29);
      useCookingStore.getState().endSession();
      expect(useCookingStore.getState().session).toBeNull();
    });
  });
});
