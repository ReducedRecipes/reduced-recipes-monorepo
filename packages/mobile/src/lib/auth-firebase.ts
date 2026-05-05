/**
 * Mobile Firebase sign-in handlers.
 *
 * Apple: native sheet via expo-apple-authentication -> Firebase OAuthCredential
 * -> signInWithCredential -> backend exchange.
 *
 * Google: native picker via @react-native-google-signin -> Google ID token ->
 * Firebase GoogleAuthProvider.credential -> signInWithCredential -> backend.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { signInWithCredential } from 'firebase/auth';
import type { User } from '@rr/shared';
import { auth, GoogleAuthProvider, GOOGLE_WEB_CLIENT_ID, OAuthProvider } from './firebase';

const API_BASE = `${process.env.EXPO_PUBLIC_API_BASE ?? 'https://reducedrecipes.com'}/api/v1`;

export interface FirebaseSessionResponse {
  token: string;
  user: User;
  is_new_user: boolean;
}

let googleConfigured = false;
function ensureGoogleConfigured() {
  if (googleConfigured) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  googleConfigured = true;
}

async function exchangeFirebaseToken(idToken: string): Promise<FirebaseSessionResponse> {
  const res = await fetch(`${API_BASE}/auth/firebase-callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(body?.error?.message ?? `Sign-in failed: ${res.status}`);
  }
  return (await res.json()) as FirebaseSessionResponse;
}

export async function signInWithApple(): Promise<FirebaseSessionResponse> {
  // Apple's nonce dance: hash a random nonce, send to Apple, get back a token
  // bound to that hash. Pass the unhashed nonce to Firebase to verify binding.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token');
  }

  const provider = new OAuthProvider('apple.com');
  const fbCredential = provider.credential({
    idToken: credential.identityToken,
    rawNonce,
  });
  const result = await signInWithCredential(auth, fbCredential);
  const firebaseIdToken = await result.user.getIdToken();
  return exchangeFirebaseToken(firebaseIdToken);
}

export async function signInWithGoogle(): Promise<FirebaseSessionResponse> {
  ensureGoogleConfigured();
  await GoogleSignin.hasPlayServices();
  const signInResult = await GoogleSignin.signIn();
  const googleIdToken = signInResult.data?.idToken;
  if (!googleIdToken) {
    throw new Error('Google did not return an ID token');
  }
  const fbCredential = GoogleAuthProvider.credential(googleIdToken);
  const result = await signInWithCredential(auth, fbCredential);
  const firebaseIdToken = await result.user.getIdToken();
  return exchangeFirebaseToken(firebaseIdToken);
}
