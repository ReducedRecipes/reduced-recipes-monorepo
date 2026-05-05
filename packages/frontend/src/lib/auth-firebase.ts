/**
 * Firebase sign-in handlers for the web client.
 *
 * Wraps Firebase's signInWithPopup (with redirect fallback for Safari) and
 * exchanges the resulting Firebase ID token for a SESSION_KV-backed session
 * via POST /api/v1/auth/firebase-callback.
 */

import { signInWithPopup, signInWithRedirect } from 'firebase/auth';
import type { User } from '@rr/shared';
import { auth, googleProvider, appleProvider } from './firebase';

export type FirebaseProvider = 'google' | 'apple';

export interface FirebaseSessionResponse {
  token: string;
  user: User;
  is_new_user: boolean;
}

const API_BASE = `${import.meta.env.VITE_API_BASE || ''}/api/v1`;

export async function signInWithFirebaseProvider(
  providerName: FirebaseProvider,
): Promise<FirebaseSessionResponse> {
  const provider = providerName === 'google' ? googleProvider : appleProvider;

  let firebaseIdToken: string;
  try {
    const result = await signInWithPopup(auth, provider);
    firebaseIdToken = await result.user.getIdToken();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/popup-blocked') {
      // Fallback: redirect-based sign-in. The redirect side handles itself
      // via getRedirectResult on next page load (caller can hook into that).
      await signInWithRedirect(auth, provider);
      throw new Error('Redirect sign-in initiated; complete in browser');
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Sign-in cancelled');
    }
    throw err;
  }

  const res = await fetch(`${API_BASE}/auth/firebase-callback`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: firebaseIdToken }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Sign-in failed: ${res.status}`);
  }

  return (await res.json()) as FirebaseSessionResponse;
}
