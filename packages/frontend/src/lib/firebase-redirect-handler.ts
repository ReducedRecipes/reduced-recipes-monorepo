/**
 * Handle a Firebase redirect-based sign-in returning to the app.
 *
 * When Safari blocks popups, signInWithFirebaseProvider falls back to
 * signInWithRedirect. The user is sent to Apple/Google, then back to this
 * app. On return we must call getRedirectResult exactly once to complete the
 * exchange. This module exposes a single function for the root component to
 * call on mount.
 */

import { getRedirectResult } from 'firebase/auth';
import type { User } from '@rr/shared';
import { auth } from './firebase';

export interface FirebaseRedirectResult {
  token: string;
  user: User;
  is_new_user: boolean;
}

const API_BASE = `${import.meta.env.VITE_API_BASE || ''}/api/v1`;

export async function handleFirebaseRedirect(): Promise<FirebaseRedirectResult | null> {
  const result = await getRedirectResult(auth);
  if (!result) return null;
  const idToken = await result.user.getIdToken();
  const res = await fetch(`${API_BASE}/auth/firebase-callback`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Sign-in failed: ${res.status}`);
  }
  return (await res.json()) as FirebaseRedirectResult;
}
