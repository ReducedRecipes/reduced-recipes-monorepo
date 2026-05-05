# Firebase Auth — mobile pickup handoff

**Date:** 2026-05-05
**Status:** Web + Workers shipped on prod (PR #300, released as v1.5.0). Mobile (Tasks 7-9) pending.

## What is done

- **Server:** `POST /api/v1/auth/firebase-callback` is live. Verifies Firebase ID tokens via JWKS (cached in `CACHE_KV`), upserts users, creates `SESSION_KV` sessions. Existing `/auth/google/url` and `/auth/google/callback` PKCE routes kept alongside for the rollout window.
- **Frontend:** SignInMenu popover with Apple + Google. Firebase popup with Safari redirect fallback (`getRedirectResult` on app mount). In-app-browser modal preserved. `BookmarkButton` and `FollowButton` route through the `open-signin-menu` event.
- **Mobile config staged but not wired:** `packages/mobile/GoogleService-Info.plist` committed, `app.json` has `googleServicesFile` and `usesAppleSignIn: true`. No Firebase code in mobile yet.
- **Live-tested by user:** sign-in works end-to-end on web; existing Google users land in their accounts cleanly.

## What is pending

**Mobile Tasks 7-9** in `docs/superpowers/plans/2026-05-05-apple-sign-in-firebase-auth.md`. Pick up there.

- **Task 7:** Add deps (`firebase`, `expo-apple-authentication`, `@react-native-google-signin/google-signin`), `expo-apple-authentication` plugin to `app.json`, create `packages/mobile/src/lib/firebase.ts` with config inlined.
- **Task 8:** TDD `signInWithApple` (native sheet via `expo-apple-authentication` + nonce dance + Firebase exchange) and `signInWithGoogle` (native picker via `@react-native-google-signin` + Firebase exchange). Both POST to `/auth/firebase-callback`.
- **Task 9:** Replace `handleSignIn` in `app/(tabs)/settings.tsx` with `handleApple` + `handleGoogle`. Use Apple's official `AppleAuthenticationButton` component on iOS for HIG compliance.

**Task 10** (acceptance) for mobile: real-device iOS test via TestFlight, including the Apple Sign In flow that App Store review will check.

**Cleanup PR (separate, ~3 weeks post-deploy):** Delete `packages/workers/src/lib/google-oauth.ts`, the `/auth/google/url` and `/auth/google/callback` route handlers, the `auth-state:*` KV writes, and `getGoogleAuthUrl` in `packages/frontend/src/lib/api.ts`. Wait until iOS users have updated past the dual-system window.

## Inputs the next session needs

The Google OAuth Web Client ID is required by `@react-native-google-signin/google-signin` (it asks for the WEB client, not the iOS one, because that's how Firebase ties them together):

- Find it at: Firebase Console → Authentication → Sign-in method → Google → Web SDK configuration → Web client ID. Or Google Cloud Console → APIs & Services → Credentials → "Web client (auto created by Google Service)".
- Format: `<projectNumber>-<hash>.apps.googleusercontent.com`.
- Per the Firebase-keys-committable rule (see auto-memory), inline this directly in `packages/mobile/src/lib/firebase.ts` as a `GOOGLE_WEB_CLIENT_ID` constant. Do not env-var it.

## How to pick up

1. Pull `main` (currently at v1.5.0, contains the merged Firebase server + frontend work).
2. Cut a new branch: `git checkout -b feat/firebase-auth-mobile`.
3. Read the plan from Task 7 onward: `docs/superpowers/plans/2026-05-05-apple-sign-in-firebase-auth.md`.
4. Use the subagent-driven-development pattern that worked well last time: implementer → spec reviewer → code quality reviewer per task.
5. Local mobile testing before TestFlight: simulator works for the React Native bundle, but **Sign in with Apple requires a real device** (the Apple sheet doesn't render on simulator). Plan to push a TestFlight build before declaring Task 9 done.

## Pre-existing context that affects this work

- `packages/mobile/GoogleService-Info.plist` and `packages/mobile/google-services.json` are both committed and gitignore-clean. Don't try to re-add them to gitignore.
- The mobile `auth.ts` already exposes `storeToken`, `getToken`, `deleteToken` against `expo-secure-store` keyed `session_token`. Reuse it from the new sign-in handlers — don't introduce a parallel storage layer.
- The mobile auth store at `packages/mobile/src/stores/auth.store.ts` exposes `setSession(token, user, isNew?)` and `clearSession()`. Call these after `storeToken`, same pattern as the existing `handleSignIn`.
- `EXPO_PUBLIC_API_BASE` is set in `eas.json` per build profile. Read it as `process.env.EXPO_PUBLIC_API_BASE` in the new `auth-firebase.ts`.

## Risks worth naming

- **Apple revocation** is not handled. A user who revokes Sign in with Apple in iOS Settings then re-signs-in will appear as a new account. Documented as accepted risk in the spec; the existing account-delete flow covers the manual case.
- **Hide-My-Email accounts stay separate** by design. No link UI in v1.
- **Old mobile installs on the unmerged Google-PKCE flow** continue to work for ~3 weeks until cleanup ships. Existing `SESSION_KV` sessions remain valid; only fresh sign-ins from those installs would 404.

## Pointers

- Spec: `docs/superpowers/specs/2026-05-05-apple-sign-in-firebase-auth-design.md`
- Plan: `docs/superpowers/plans/2026-05-05-apple-sign-in-firebase-auth.md`
- Released PR: https://github.com/ReducedRecipes/reduced-recipes-monorepo/pull/300
- Firebase project: `reducedrecipes` (Console: https://console.firebase.google.com/project/reducedrecipes/authentication)
