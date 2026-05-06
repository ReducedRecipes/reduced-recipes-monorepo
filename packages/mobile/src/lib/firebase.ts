/**
 * Firebase initialization for React Native (Expo).
 *
 * Uses the modular firebase JS SDK. Apple/Google credentials are obtained via
 * native libraries (expo-apple-authentication, @react-native-google-signin)
 * and exchanged for Firebase ID tokens via signInWithCredential.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDqJceLhCOUs-ViAtmdGy_5hmaLp9Fj7MY',
  authDomain: 'reducedrecipes.firebaseapp.com',
  projectId: 'reducedrecipes',
  appId: '1:185737034001:web:bd59e775cb6809a4cd74b0',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export { GoogleAuthProvider, OAuthProvider };

// OAuth WEB client ID for the Firebase project. Used by
// @react-native-google-signin/google-signin to mint a Google ID token that we
// then exchange with Firebase via signInWithCredential. This is the WEB client
// (not iOS or Android) because that's how Firebase ties Google sign-in together.
export const GOOGLE_WEB_CLIENT_ID =
  '185737034001-6g3lst3mlrvrvl4pjkq8l6a5tsi9brg9.apps.googleusercontent.com';
