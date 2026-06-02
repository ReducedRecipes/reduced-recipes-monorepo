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
        .catch(() => {
          // Stay with local state on failure.
        });
    }
  }, []);

  const persist = useCallback((next: PantryState) => {
    setPantry(next);
    saveLocalPantry(next);
    if (isSignedIn()) {
      putPantry(next).catch(() => { /* best-effort */ });
    }
  }, []);

  const setHave = useCallback((next: string[]) => {
    persist({ have: next, exclude: pantry.exclude });
  }, [pantry.exclude, persist]);

  const setExclude = useCallback((next: string[]) => {
    persist({ have: pantry.have, exclude: next });
  }, [pantry.have, persist]);

  return { pantry, setHave, setExclude, hydrated };
}
