import { useEffect, useState, useCallback } from 'react';
import { emptyPantryState, type PantryState } from '@rr/shared/pantry';
import { loadLocalPantry, saveLocalPantry, isSignedIn } from '../lib/pantry-storage';
import { getPantry, putPantry } from '../lib/api';

export interface UsePantry {
  pantry: PantryState;
  setHave: (next: string[]) => void;
  setExclude: (next: string[]) => void;
  hydrated: boolean;
}

export function usePantry(): UsePantry {
  const [pantry, setPantry] = useState<PantryState>(emptyPantryState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const local = loadLocalPantry();
    setPantry(local);
    setHydrated(true);

    if (isSignedIn()) {
      getPantry()
        .then((res) => {
          setPantry(res.pantry);
          saveLocalPantry(res.pantry);
        })
        .catch((err) => {
          console.warn('[pantry] server sync failed, keeping local state', err);
        });
    }
  }, []);

  const sideEffect = useCallback((next: PantryState) => {
    saveLocalPantry(next);
    if (isSignedIn()) {
      putPantry(next).catch(() => { /* best-effort */ });
    }
  }, []);

  const setHave = useCallback((next: string[]) => {
    setPantry((prev) => {
      const updated = { have: next, exclude: prev.exclude };
      sideEffect(updated);
      return updated;
    });
  }, [sideEffect]);

  const setExclude = useCallback((next: string[]) => {
    setPantry((prev) => {
      const updated = { have: prev.have, exclude: next };
      sideEffect(updated);
      return updated;
    });
  }, [sideEffect]);

  return { pantry, setHave, setExclude, hydrated };
}
