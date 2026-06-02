import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '../lib/mmkv';
import { getPantry, putPantry } from '../lib/api';
import { emptyPantryState, type PantryState } from '@rr/shared/pantry';

interface PantryStore extends PantryState {
  hydrated: boolean;
  addHave: (item: string) => void;
  removeHave: (item: string) => void;
  addExclude: (item: string) => void;
  removeExclude: (item: string) => void;
  replace: (next: PantryState) => void;
  syncFromServer: () => Promise<void>;
}

function normaliseOne(raw: string): string {
  return raw.trim().toLowerCase();
}

function pushUnique(list: string[], v: string): string[] {
  const n = normaliseOne(v);
  if (!n || list.includes(n)) return list;
  return [...list, n];
}

async function pushToServer(state: PantryState): Promise<void> {
  try { await putPantry(state); } catch { /* best-effort */ }
}

export const usePantryStore = create<PantryStore>()(
  persist(
    (set, get) => ({
      ...emptyPantryState(),
      hydrated: false,
      addHave: (item) => {
        const next = { have: pushUnique(get().have, item), exclude: get().exclude };
        set(next);
        void pushToServer(next);
      },
      removeHave: (item) => {
        const n = normaliseOne(item);
        const next = { have: get().have.filter((x) => x !== n), exclude: get().exclude };
        set(next);
        void pushToServer(next);
      },
      addExclude: (item) => {
        const next = { have: get().have, exclude: pushUnique(get().exclude, item) };
        set(next);
        void pushToServer(next);
      },
      removeExclude: (item) => {
        const n = normaliseOne(item);
        const next = { have: get().have, exclude: get().exclude.filter((x) => x !== n) };
        set(next);
        void pushToServer(next);
      },
      replace: (next) => {
        set({ have: next.have, exclude: next.exclude });
        void pushToServer(next);
      },
      syncFromServer: async () => {
        try {
          const res = await getPantry();
          set({ have: res.pantry.have, exclude: res.pantry.exclude });
        } catch {
          // Stay with local state on failure.
        }
      },
    }),
    {
      name: 'pantry',
      storage: createJSONStorage(() => mmkvStorage),
      onRehydrateStorage: () => (state) => { if (state) state.hydrated = true; },
      partialize: (state) => ({ have: state.have, exclude: state.exclude }),
    },
  ),
);
