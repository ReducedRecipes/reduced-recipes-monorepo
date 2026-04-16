import { create } from "zustand";

export interface CookingSession {
  recipeId: string;
  currentStep: number;
  totalSteps: number;
  startedAt: Date;
  timerRunning: boolean;
  timerRemaining: number;
}

export interface CookingStoreState {
  session: CookingSession | null;

  startSession: (recipeId: string, totalSteps: number) => void;
  endSession: () => void;
  nextStep: () => void;
  prevStep: () => void;
  startTimer: (seconds: number) => void;
  pauseTimer: () => void;
  tickTimer: () => void;
}

export const useCookingStore = create<CookingStoreState>()((set) => ({
  session: null,

  startSession: (recipeId, totalSteps) =>
    set({
      session: {
        recipeId,
        currentStep: 0,
        totalSteps,
        startedAt: new Date(),
        timerRunning: false,
        timerRemaining: 0,
      },
    }),

  endSession: () => set({ session: null }),

  nextStep: () =>
    set((state) => {
      if (!state.session) return state;
      return {
        session: {
          ...state.session,
          currentStep: Math.min(
            state.session.currentStep + 1,
            state.session.totalSteps - 1,
          ),
        },
      };
    }),

  prevStep: () =>
    set((state) => {
      if (!state.session) return state;
      return {
        session: {
          ...state.session,
          currentStep: Math.max(state.session.currentStep - 1, 0),
        },
      };
    }),

  startTimer: (seconds) =>
    set((state) => {
      if (!state.session) return state;
      return {
        session: {
          ...state.session,
          timerRunning: true,
          timerRemaining: seconds,
        },
      };
    }),

  pauseTimer: () =>
    set((state) => {
      if (!state.session) return state;
      return {
        session: {
          ...state.session,
          timerRunning: false,
        },
      };
    }),

  tickTimer: () =>
    set((state) => {
      if (!state.session || !state.session.timerRunning) return state;
      const remaining = state.session.timerRemaining - 1;
      return {
        session: {
          ...state.session,
          timerRemaining: Math.max(remaining, 0),
          timerRunning: remaining > 0,
        },
      };
    }),
}));
