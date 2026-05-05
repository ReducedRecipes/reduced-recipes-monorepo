import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signInWithFirebaseProvider } from '../auth-firebase';

vi.mock('../firebase', () => ({
  auth: { mock: 'auth' },
  googleProvider: { mock: 'google' },
  appleProvider: { mock: 'apple' },
}));

const mockSignInWithPopup = vi.fn();
const mockSignInWithRedirect = vi.fn();
const mockGetIdToken = vi.fn();

vi.mock('firebase/auth', () => ({
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  signInWithRedirect: (...args: unknown[]) => mockSignInWithRedirect(...args),
}));

describe('signInWithFirebaseProvider', () => {
  beforeEach(() => {
    mockSignInWithPopup.mockReset();
    mockSignInWithRedirect.mockReset();
    mockGetIdToken.mockReset();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'session-tok',
          user: { id: 'u1', email: 'a@b.com' },
          is_new_user: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  });

  it('calls signInWithPopup, exchanges the ID token, and returns the session', async () => {
    mockSignInWithPopup.mockResolvedValueOnce({
      user: { getIdToken: mockGetIdToken.mockResolvedValueOnce('firebase-id-token') },
    });

    const result = await signInWithFirebaseProvider('google');
    expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
    expect(result.token).toBe('session-tok');
    expect(result.is_new_user).toBe(true);
  });

  it('falls back to signInWithRedirect and rejects with a marker when the popup is blocked', async () => {
    mockSignInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-blocked' });

    // signInWithRedirect navigates the page away; the function rejects with a
    // marker so the caller can stop spinning. Both halves of the contract
    // are asserted: redirect is invoked AND the function rejects.
    await expect(signInWithFirebaseProvider('apple')).rejects.toThrow(/redirect sign-in initiated/i);
    expect(mockSignInWithRedirect).toHaveBeenCalledTimes(1);
  });

  it('throws when the user cancels the popup', async () => {
    mockSignInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });

    await expect(signInWithFirebaseProvider('google')).rejects.toThrow();
  });

  it('throws when the backend returns an error', async () => {
    mockSignInWithPopup.mockResolvedValueOnce({
      user: { getIdToken: mockGetIdToken.mockResolvedValueOnce('firebase-id-token') },
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'INVALID_TOKEN', message: 'bad' } }), {
        status: 401,
      }),
    );

    await expect(signInWithFirebaseProvider('google')).rejects.toThrow();
  });
});
