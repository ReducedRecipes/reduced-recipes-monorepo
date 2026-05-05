import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({
  auth: { mock: 'auth' },
  OAuthProvider: class {
    credential(args: { idToken: string; rawNonce: string }) {
      return { mock: 'apple-cred', ...args };
    }
  },
  GoogleAuthProvider: { credential: vi.fn(() => ({ mock: 'google-cred' })) },
  GOOGLE_WEB_CLIENT_ID: 'test-web-client-id',
}));

const mockSignInWithCredential = vi.fn();
vi.mock('firebase/auth', () => ({
  signInWithCredential: (...args: unknown[]) => mockSignInWithCredential(...args),
}));

const mockAppleSignIn = vi.fn();
vi.mock('expo-apple-authentication', () => ({
  signInAsync: (...args: unknown[]) => mockAppleSignIn(...args),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: vi.fn().mockResolvedValue(true),
}));

const mockGoogleConfigure = vi.fn();
const mockGoogleSignIn = vi.fn();
const mockHasPlayServices = vi.fn().mockResolvedValue(true);
vi.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...args: unknown[]) => mockGoogleConfigure(...args),
    signIn: (...args: unknown[]) => mockGoogleSignIn(...args),
    hasPlayServices: (...args: unknown[]) => mockHasPlayServices(...args),
  },
  statusCodes: { SIGN_IN_CANCELLED: 'CANCELLED' },
}));

const mockExpoCryptoDigest = vi.fn();
vi.mock('expo-crypto', () => ({
  digestStringAsync: (...args: unknown[]) => mockExpoCryptoDigest(...args),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  randomUUID: vi.fn(() => 'random-nonce'),
}));

import { signInWithApple, signInWithGoogle } from '../auth-firebase';

describe('mobile signInWithApple', () => {
  beforeEach(() => {
    mockSignInWithCredential.mockReset();
    mockAppleSignIn.mockReset();
    mockExpoCryptoDigest.mockReset().mockResolvedValue('hashed-nonce');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'sess',
          user: { id: 'u', email: 'a@b.com' },
          is_new_user: false,
        }),
        { status: 200 },
      ),
    );
  });

  it('signs in via Apple, exchanges with Firebase, and posts to backend', async () => {
    mockAppleSignIn.mockResolvedValueOnce({
      identityToken: 'apple-id-token',
      authorizationCode: 'auth-code',
    });
    mockSignInWithCredential.mockResolvedValueOnce({
      user: { getIdToken: vi.fn().mockResolvedValue('firebase-id-token') },
    });

    const result = await signInWithApple();
    expect(mockAppleSignIn).toHaveBeenCalledTimes(1);
    expect(mockExpoCryptoDigest).toHaveBeenCalled();
    expect(mockSignInWithCredential).toHaveBeenCalled();
    expect(result.token).toBe('sess');
  });

  it('throws when Apple returns no identityToken', async () => {
    mockAppleSignIn.mockResolvedValueOnce({ identityToken: null });
    await expect(signInWithApple()).rejects.toThrow();
  });
});

describe('mobile signInWithGoogle', () => {
  beforeEach(() => {
    mockSignInWithCredential.mockReset();
    mockGoogleSignIn.mockReset();
    mockGoogleConfigure.mockReset();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'sess',
          user: { id: 'u', email: 'a@b.com' },
          is_new_user: false,
        }),
        { status: 200 },
      ),
    );
  });

  it('signs in via Google, exchanges with Firebase, and posts to backend', async () => {
    mockGoogleSignIn.mockResolvedValueOnce({ data: { idToken: 'google-id-token' } });
    mockSignInWithCredential.mockResolvedValueOnce({
      user: { getIdToken: vi.fn().mockResolvedValue('firebase-id-token') },
    });

    const result = await signInWithGoogle();
    expect(mockGoogleSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignInWithCredential).toHaveBeenCalled();
    expect(result.token).toBe('sess');
  });
});
