import { useEffect, useRef } from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useCookingStore } from "../stores/cooking.store";

export function useCookingSession(recipeId: string, steps: string[]) {
  const store = useCookingStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    activateKeepAwakeAsync().catch(() => {});
    store.startSession(recipeId, steps.length);

    return () => {
      deactivateKeepAwake();
      store.endSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, steps.length]);

  useEffect(() => {
    if (store.session?.timerRunning) {
      intervalRef.current = setInterval(() => {
        store.tickTimer();
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.session?.timerRunning]);

  return {
    currentStep: store.session?.currentStep ?? 0,
    totalSteps: store.session?.totalSteps ?? steps.length,
    nextStep: store.nextStep,
    prevStep: store.prevStep,
    startTimer: store.startTimer,
    pauseTimer: store.pauseTimer,
    timerRemaining: store.session?.timerRemaining ?? 0,
    timerRunning: store.session?.timerRunning ?? false,
    endSession: store.endSession,
  };
}
