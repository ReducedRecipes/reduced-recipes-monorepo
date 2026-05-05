# Apple Sign In + Firebase Auth migration

**Date:** 2026-05-05
**Status:** Design approved, awaiting plan
**Driver:** iOS App Store compliance (Apple requires Sign in with Apple when an app offers Google login)

## Summary

Add Sign in with Apple to web and mobile, migrate the existing Google PKCE flow to Firebase Auth, and use Firebase as an identity broker. The existing `users`, `user_auth_providers`, `bookmarks`, `collections` tables remain untouched. The existing `SESSION_KV` session model and `requireAuth` middleware remain untouched. Firebase's only job is verifying the user's identity at sign-in; everything downstream of that is unchanged.

Magic link, password login, and account-linking UI are explicitly out of scope. Apple Hide-My-Email accounts are accepted as separate accounts with no manual link option.

## Goals

- iOS app passes App Store review by offering Sign in with Apple alongside Google.
- Web users can sign in with Apple in addition to Google.
- Existing Google users land in their existing accounts on first Firebase sign-in (no data migration).
- Apple's `client_secret` JWT rotation chore is offloaded to Firebase.
- No new email infrastructure dependency.

## Non-goals

- Email magic link, password login, or any non-OAuth credential.
- A "Linked accounts" settings UI.
- Apple revocation webhook handling.
- Replacing the existing `SESSION_KV` session model with Firebase-issued JWTs.
- Force-logout or backfill of existing users.

## Architecture

Firebase Auth becomes the front door for Apple + Google. Client SDKs (web: `firebase` JS SDK; iOS: `expo-apple-authentication` + Firebase) handle the OAuth dance and return a Firebase ID token. The Worker verifies the token once at sign-in via Firebase's public JWKS, upserts the user, and creates a `SESSION_KV` session. Every authenticated request after that uses the existing cookie/bearer mechanism with no Firebase involvement.

### Component map

**`packages/workers` (server)**

- New: `src/lib/firebase-jwt.ts` — verifies a Firebase ID token against Firebase's JWKS, cached in `CACHE_KV` with the upstream `Cache-Control` TTL. Pure Web Crypto, no SDK.
- New: `POST /api/v1/auth/firebase-callback` route — accepts a Firebase ID token, verifies it, extracts the underlying provider sub from `firebase.identities`, upserts/matches the user, creates a `SESSION_KV` session, returns the session token (mobile) or sets the `__Host-session` cookie (web).
- Removed (after a 3-week stability window): `src/lib/google-oauth.ts`, `GET /api/v1/auth/google/url`, `GET /api/v1/auth/google/callback`, the `auth-state:*` KV writes.

**`packages/frontend` (web)**

- New dependency: `firebase` (auth submodule only, ~50 KB gzipped).
- New: `src/lib/firebase.ts` — initialises the Firebase app + auth instance with values inlined (Firebase web config is not secret per Google's design; restricted by authorized domains).
- Modified: existing "Sign in with Google" button now triggers `signInWithPopup(googleProvider)` (with Safari `popup-blocked` fallback to `signInWithRedirect`).
- New: "Sign in with Apple" button calling `signInWithPopup(new OAuthProvider('apple.com'))`. Same Safari fallback.
- After Firebase sign-in: client POSTs the ID token to `/api/v1/auth/firebase-callback`, server sets the cookie.

**`packages/mobile` (iOS / Android)**

- New dependencies: `expo-apple-authentication`, `@react-native-firebase/app`, `@react-native-firebase/auth`.
- New: `src/lib/firebase.ts` — initialises Firebase.
- Modified: existing Google sign-in flow now uses Firebase's Google provider.
- New: "Sign in with Apple" button (iOS only, hidden on Android per Apple branding rules) using `expo-apple-authentication` to get an Apple credential, then `signInWithCredential(appleCredential)` to mint a Firebase ID token, then POST to backend.
- After Firebase sign-in: same as today — POST id token, receive bearer session token, store in `expo-secure-store`.

**Unchanged**

- All schemas (`users`, `user_auth_providers`, `bookmarks`, `collections`, `dietary_preferences`, etc.).
- `requireAuth` middleware and every authenticated endpoint.
- Mobile bearer-token + `expo-secure-store` pattern.
- Web `__Host-session` cookie pattern.
- Account deletion flow (already exists, App Store-compliant).

### Schema delta

None. The `user_auth_providers` table accepts arbitrary provider strings (`provider TEXT NOT NULL`); Firebase rows are inserted as `provider='firebase'`, `provider_id=<firebase_uid>`. Existing `provider='google'` rows are preserved as historical record and as escape hatch.

## Data flow

### Flow A: New user signs in with Apple on iOS

1. User taps "Sign in with Apple."
2. Native iOS sheet appears via `expo-apple-authentication`. Apple returns `identityToken`, `authorizationCode`, optional name (first sign-in only), email (real or relay).
3. Client builds Firebase `OAuthCredential` from `identityToken` + nonce.
4. `signInWithCredential(auth, credential)` → Firebase ID token.
5. Client POSTs `{ idToken }` to `/api/v1/auth/firebase-callback` with `Authorization: Bearer` (mobile).
6. Worker:
   1. Verifies the ID token against Firebase JWKS.
   2. Extracts `firebase_uid` (sub), `provider='apple.com'`, `apple_sub` from `firebase.identities['apple.com'][0]`, email if present, `email_verified`.
   3. Looks up `user_auth_providers WHERE provider='apple' AND provider_id=apple_sub` → miss.
   4. Looks up `users WHERE email=?` only if `email_verified=true`. If hit, auto-link onto existing user. If miss or unverified, proceed to new user.
   5. Inserts `users` (new UUID, email, name from Apple if first sign-in).
   6. Inserts `user_auth_providers` with `provider='apple'` and `provider='firebase'`.
   7. Inserts the default "Saved" collection.
   8. Inserts a `consent_records` row.
   9. Creates a `SESSION_KV` session, returns the token.
7. Client stores token in `expo-secure-store`, navigates home.

### Flow B: New user signs in with Apple on web

Same as Flow A except:

- Step 2 is `signInWithPopup(auth, new OAuthProvider('apple.com'))` (with Safari `signInWithRedirect` fallback).
- Step 5 sends the ID token via fetch with `credentials: 'include'`; server sets `__Host-session` cookie.

### Flow C: Existing Google user signs in (migration path)

1. User taps "Sign in with Google" — now wired to Firebase.
2. `signInWithPopup(googleProvider)` on web, native Google flow on mobile.
3. Firebase ID token returned.
4. Client POSTs to `/api/v1/auth/firebase-callback`.
5. Worker:
   1. Verifies token.
   2. Extracts `firebase_uid`, `google_sub` from `firebase.identities['google.com'][0]`.
   3. `user_auth_providers WHERE provider='firebase' AND provider_id=firebase_uid` → miss.
   4. `user_auth_providers WHERE provider='google' AND provider_id=google_sub` → hit (existing pre-Firebase account).
   5. Inserts a new `provider='firebase'` row linking `firebase_uid` to the existing `user_id`.
   6. Creates session, returns.
6. User lands in their existing account, all data intact.

Subsequent sign-ins skip step 5d (5c now hits) and go straight to session creation.

### Flow D: Returning user (any provider, any platform)

1. Sign in via Apple or Google.
2. Firebase ID token.
3. POST to `/api/v1/auth/firebase-callback`.
4. Worker verifies, looks up by `provider='firebase' AND provider_id=firebase_uid` → hit. Refreshes `users.updated_at`. Creates session.

Steady state. One DB lookup, one session write.

### Unchanged paths

**Authenticated request:** Browser sends `__Host-session` cookie or mobile sends `Authorization: Bearer <token>`. `requireAuth` reads `SESSION_KV`, attaches `userId` + `user` to context. No Firebase involvement.

**Sign-out:** `POST /api/v1/auth/logout` deletes the `SESSION_KV` entry. Client also calls `firebase.auth().signOut()` to clear the Firebase token cache locally.

### JWKS caching

`firebase-jwt.ts` fetches `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com` (Firebase's signing keys), caches in `CACHE_KV` with the upstream `Cache-Control: max-age` TTL (typically 1–6 hours). Concurrent cache misses are idempotent.

## Firebase project setup

One Firebase project (`reducedrecipes`). Both Apple and Google providers enabled in Authentication → Sign-in method.

**Apple provider config** (already done):

- Service ID, Apple Team ID, Key ID, `.p8` private key contents pasted into Firebase. Firebase signs the rotating `client_secret` JWT — no manual rotation chore.
- Apple Developer Service ID configured with the Firebase callback URL `https://<project-id>.firebaseapp.com/__/auth/handler`.

**Google provider config** (already done):

- Provider enabled in Firebase. Reusing the existing Google OAuth client (paste `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in Firebase's Web SDK configuration) is recommended so users see the same consent screen as today, but not required — migration matches on the Google `sub`, which is the same regardless of which OAuth client issued the token.

**Authorized domains:** `<project-id>.firebaseapp.com`, `localhost`, `reducedrecipes.com`, `reduced.recipes`, plus any preview URLs as needed (Firebase doesn't accept wildcards).

**iOS app registered** with bundle ID `com.reducedrecipes.app`. `GoogleService-Info.plist` placed at `packages/mobile/GoogleService-Info.plist` and to be committed alongside the implementation PR (Firebase iOS API key is bundle-ID-restricted, not secret — same treatment as the existing committed `google-services.json`).

**Android app registered** with package `com.reducedrecipes.app`. `google-services.json` already present at `packages/mobile/google-services.json`, already committed.

`app.json` updated with `googleServicesFile: "./GoogleService-Info.plist"` and `usesAppleSignIn: true` (auto-adds the Sign In with Apple capability when EAS builds).

**Hardening (recommended, takes 5 minutes):** restrict the Firebase web API key in Google Cloud Console → Credentials → "Browser key" → HTTP referrers matching the authorized domains. iOS / Android keys are auto-restricted by bundle ID / package + SHA-1.

## Migration & rollout

### Phasing

Server + frontend deploy together via the existing `deploy.yml`. Mobile ships through App Store + Play Store review and reaches users days-to-weeks later. The server runs **both** auth systems for the transition window:

- Day 0: Workers deploy with old + new auth routes, frontend with new Firebase flow only, mobile build submitted to App Store + Play Store.
- Days 1–14: mobile build approved + released.
- Day 14: audit traffic — confirm < 1% of new auth hits the old PKCE routes.
- Day 21: cleanup PR deletes `google-oauth.ts`, `/auth/google/url`, `/auth/google/callback`, `auth-state:*` writes. Old in-the-wild mobile installs that haven't updated will see auth fail on next sign-in attempt; users update via App Store. Existing valid sessions on those installs continue working until expiry, so the failure mode is rarely user-visible.

### Existing user impact at deploy moment

- **Logged-in users:** zero impact. Sessions remain valid until expiry.
- **Logged-out users:** see new sign-in UI immediately. Existing Google users go through Flow C and land in their original account.
- **Mid-OAuth-flow at deploy moment:** rare; their callback fails; they retry; succeeds. Deploy during a quiet window.

### Rollback

- **Server:** old PKCE routes still exist for 3 weeks. Frontend hotfix to revert reaches users in minutes via Cloudflare Pages.
- **Mobile:** harder once a new build is in the wild. Mitigation: thorough TestFlight testing before App Store release.

### Explicitly not doing

- No backfill script.
- No forced re-authentication.
- No data migration.
- No deletion of historical `provider='google'` rows.

## Error handling

### Firebase token verification (server)

| Failure | Cause | Response |
|---|---|---|
| `exp` past | Token > 1 hour old | `401 TOKEN_EXPIRED`. Client force-refreshes via `getIdToken(true)` and re-posts. |
| Bad signature | Clock skew, key rotation race, forgery | `401 INVALID_TOKEN`. Client signs out and restarts. |
| Wrong `aud` | Token issued for a different Firebase project | `401 INVALID_TOKEN`. Defensive. |
| Wrong `iss` | Not from `https://securetoken.google.com/<project-id>` | Same. |
| JWKS fetch fails | Cold start + Firebase outage | `503 AUTH_UPSTREAM_UNAVAILABLE`. Client retries. |

### Client OAuth flow

| Event | Behaviour |
|---|---|
| User cancels Apple/Google consent | Silent return to sign-in screen, no error toast. |
| Network error during the OAuth dance | Toast: "Couldn't reach Apple/Google, check your connection." Retry button. |
| Safari + popup blocked | Catch `auth/popup-blocked`. Fall back to `signInWithRedirect` for that session. |
| Firebase SDK init fails | Boot-time crash with clear log. App shows "auth misconfigured." Caught by CI smoke test. |

### Apple-specific quirks

1. **Name + email only on first sign-in.** Store on first upsert; never overwrite with empty values on subsequent sign-ins.
2. **Hide My Email relay.** Treated as a normal verified email; per Q3 decision, no email-match against existing Google accounts (different email = different user).
3. **`identityToken` 10-minute TTL.** Client must exchange immediately via `signInWithCredential`.
4. **Apple revocation.** Not handled in v1. A revoked-then-re-signed-in user appears as a new account. They can manually delete the old account via the existing flow.

### Server-side data integrity

| Case | Handling |
|---|---|
| Two devices sign in simultaneously | `ON CONFLICT DO UPDATE` on `user_auth_providers`; `users.email UNIQUE` makes both writes safe (existing pattern). |
| Token has no `firebase.identities` | `400 INVALID_TOKEN`. Defensive — should never happen with our config. |
| `firebase_uid` row exists but `users.id` missing | `500 USER_INTEGRITY_ERROR`. Log loudly. Do not silently recreate. |
| `email_verified=false` in token | Skip the email-match step in linking logic; only match on `provider_id`. Prevents an attacker holding an unverified email from linking into someone else's account. |

### Accepted risks

- Firebase Auth outage disables sign-in for new users. Existing valid sessions unaffected. No fallback provider.
- JWKS rotation between cache TTL: theoretically possible, in practice rare; next verify fails, client refreshes, succeeds.
- Concurrent sign-in from same provider on two devices does not deduplicate sessions. Same as today.

## Testing

### What tests exist where

| Layer | What | Pattern |
|---|---|---|
| Worker unit | `firebase-jwt.ts` — happy path, expired, bad sig, wrong aud, wrong iss, missing claims, JWKS fetch failure, JWKS cache hit/miss | `vitest`, real Web Crypto, mocked `fetch` for JWKS |
| Worker integration | `POST /auth/firebase-callback` — new user, returning user, Google migration, Apple email-match auto-link, email-not-verified skip-link, Hide-My-Email separate-account, Apple "no name on subsequent sign-in" | Miniflare bindings against real D1 + KV |
| Frontend unit | `firebase.ts` init, sign-in handlers (mocked Firebase SDK) | Source-string assertions per existing pattern |
| Mobile unit | Apple credential → Firebase exchange, Google handler (mocked) | Same pattern |
| Manual / E2E | Full Apple flow on real iOS via TestFlight, Google via Firebase on web, existing Google user lands in their account | Cannot fake Apple's native sheet |

### Test fixtures

`firebase-jwt.test.ts` mints test tokens at test time using a controlled keypair, overrides JWKS-fetch with a stub returning the matching public key, then verifies. One-time setup in `__fixtures__/firebase-tokens.ts`.

### Explicitly not tested

- Firebase SDK internals (Google tests their own SDK).
- Apple's native sheet (`expo-apple-authentication` mocked at module level, existing pattern).
- Real network calls to Firebase JWKS (`fetch` is intercepted).

### Acceptance bar before merge

1. All vitest suites green.
2. `pnpm typecheck` passes.
3. Manual sign-in worked on: web (Chrome), web (Safari), iOS TestFlight (Apple + Google), existing-Google-user-on-web migration.
4. Verified in Firebase console **Users** that real users get a single Firebase row.
5. Verified in D1 that migrated users have both `provider='google'` and `provider='firebase'` rows in `user_auth_providers`.

### Acceptance bar before iOS App Store submission

6. Sign in with Apple button at least as prominent as Google on the sign-in screen (Apple HIG).
7. Account deletion still works end-to-end on a Firebase-linked user.

## Open questions

None at this stage. Implementation plan to be authored next via the writing-plans skill.

## Decision log

| Q | Decision | Rationale |
|---|---|---|
| Drivers | App Store compliance | iOS submission requires Sign in with Apple when offering Google login |
| Email/password vs magic link vs none | None (Apple + Google only) | OAuth covers ~95% of users; magic link adds email infra dependency for marginal value |
| Account linking | Auto-link on verified-email match; Hide-My-Email = separate account; no link UI | Simplest model that handles 95% case correctly |
| Identity broker | Firebase Auth | Offloads Apple's `client_secret` rotation chore; existing Google users migrate seamlessly via shared `sub` |
| Session model | Keep `SESSION_KV` + cookies/bearer; Firebase only verifies at sign-in | Smallest blast radius; downstream code untouched |
| Phasing | Single deploy; 3-week dual-system window for old mobile installs | Realistic given App Store review delays |
| Apple revocation handling | Not in v1 | Vanishingly rare; existing account-delete flow covers the manual case |
| Firebase config secrecy | Web/iOS/Android API keys committed to repo | Public by Firebase design; restricted by authorized domains / bundle ID |
