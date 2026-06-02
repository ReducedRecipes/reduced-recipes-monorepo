import { emptyPantryState, isPantryState, type PantryState } from '@rr/shared/pantry';

const KEY = 'rr_pantry';

export function loadLocalPantry(): PantryState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyPantryState();
    const parsed = JSON.parse(raw);
    return isPantryState(parsed) ? parsed : emptyPantryState();
  } catch {
    return emptyPantryState();
  }
}

export function saveLocalPantry(state: PantryState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota or privacy-mode: silent
  }
}

export function isSignedIn(): boolean {
  try {
    return Boolean(localStorage.getItem('session_token'));
  } catch {
    return false;
  }
}
