import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "../lib/mmkv";

interface SavedState {
  ids: Set<string>;
  isSaved: (id: string) => boolean;
  addId: (id: string) => void;
  removeId: (id: string) => void;
  setIds: (ids: string[]) => void;
  hydrate: (ids: string[]) => void;
}

export const useSavedStore = create<SavedState>()(
  persist(
    (set, get) => ({
      ids: new Set<string>(),

      isSaved: (id: string) => get().ids.has(id),

      addId: (id: string) =>
        set((state) => {
          const next = new Set(state.ids);
          next.add(id);
          return { ids: next };
        }),

      removeId: (id: string) =>
        set((state) => {
          const next = new Set(state.ids);
          next.delete(id);
          return { ids: next };
        }),

      setIds: (ids: string[]) => set({ ids: new Set(ids) }),

      hydrate: (ids: string[]) => set({ ids: new Set(ids) }),
    }),
    {
      name: "saved-recipes",
      storage: createJSONStorage(() => mmkvStorage, {
        replacer: (_key: string, value: unknown) => {
          if (value instanceof Set) {
            return [...value];
          }
          return value;
        },
        reviver: (key: string, value: unknown) => {
          if (key === "ids" && Array.isArray(value)) {
            return new Set(value);
          }
          return value;
        },
      }),
    },
  ),
);
