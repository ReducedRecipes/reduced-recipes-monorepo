/**
 * Firebase initialization for the web client.
 *
 * Config values are public per Firebase's design (restricted by authorized
 * domains in the Firebase console). They are committed in source rather than
 * read from env vars.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDqJceLhCOUs-ViAtmdGy_5hmaLp9Fj7MY',
  // Custom auth domain on the app's own eTLD+1. The Pages Function at
  // packages/frontend/functions/__/auth/[[path]].ts reverse-proxies these
  // reserved paths to reducedrecipes.firebaseapp.com so the Firebase auth
  // iframe is same-origin with the SPA. Required to make signInWithRedirect
  // work on iOS Safari / Chrome (ITP partitions third-party storage).
  authDomain: 'reduced.recipes',
  projectId: 'reducedrecipes',
  appId: '1:185737034001:web:bd59e775cb6809a4cd74b0',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');
