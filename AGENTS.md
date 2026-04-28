# Agent Instructions -- ReducedRecipes Monorepo

Read `CLAUDE.md` first for project overview. This file contains strict rules agents must follow.

## Non-negotiable rules

1. **Conventional Commits.** Every commit message must start with `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, or `test:`. release-please parses these to determine version bumps. A `feat:` triggers a minor bump, `fix:` triggers a patch bump. Breaking changes use `feat!:` or a `BREAKING CHANGE:` footer.

2. **Never use em dashes** (--) in any written content. Use hyphens or rewrite the sentence.

3. **Never commit secrets, .env files, or credentials.** Check `git diff --cached` before committing.

4. **Never push --force to main.** Never skip hooks with --no-verify.

5. **Always run the full check before declaring work done:**
   ```sh
   pnpm typecheck && pnpm build && pnpm test
   ```
   All three must pass. Do not commit with failing tests.

6. **Do not modify source code to fix test failures unless the source is genuinely buggy.** Update tests to match the deployed source behavior.

7. **Do not add features, refactor, or "improve" code beyond what was asked.** A bug fix is just a bug fix. Do not add docstrings, comments, or type annotations to code you did not change.

## Before you start

### Understand the monorepo

```
packages/shared/      -- Types and utilities shared across all packages
packages/workers/     -- 9 Cloudflare Workers (API + crawl pipeline + crons)
packages/frontend/    -- React SPA deployed to Cloudflare Pages
packages/mobile/      -- Expo React Native app (iOS/Android)
```

Build order matters: `shared` -> `workers` -> `frontend`. The root `pnpm build` handles this.

### Key commands

```sh
pnpm build                    # Build all (shared -> workers -> frontend)
pnpm typecheck                # Typecheck all packages
pnpm test                     # Run all tests (vitest)
pnpm test -- path/to/file     # Run a single test file
pnpm dev                      # Frontend dev server
pnpm mobile                   # Expo dev server
```

## Package-specific instructions

### packages/shared

- Multi-export package. Exports are defined in `package.json` under `"exports"`.
- When adding a new export, add it to both `package.json` exports map AND the alias list in `vitest.config.ts`.
- All types go in `src/types.ts`. This is the canonical type source for the entire monorepo.
- Import pattern: `import type { RecipeSummary } from "@rr/shared"` for types, `import { fn } from "@rr/shared/module"` for utilities.

### packages/workers

- **Runtime**: Cloudflare Workers. All code runs on the edge.
- **Framework**: Hono v4. Routes defined in `src/api.ts` and `src/routes/*.ts`.
- **Auth middleware**: `requireAuth` (401 if missing), `optionalAuth` (sets userId if present). Imported from `src/middleware/auth.ts`.
- **Database**: D1 (SQL). Use parameterized queries only. Never interpolate user input into SQL.
- **Each worker has its own wrangler config**: `wrangler.{name}.toml`. When adding a new binding (D1, KV, Queue, etc.), add it to the correct toml file.

#### Adding a new API endpoint

1. Create or edit a route file in `src/routes/`.
2. Register the Hono sub-app in `src/api.ts` via `app.route('/', myRoutes)`.
3. Add auth middleware (`requireAuth` or `optionalAuth`) to the route.
4. Write tests in the same directory or `src/__tests__/`.
5. If the endpoint needs a new D1 table, create a migration file (see Database section).

#### Adding a new worker

1. Create `src/{name}.ts` with the worker entry point.
2. Create `wrangler.{name}.toml` with bindings.
3. Add a deploy script to `packages/workers/package.json`.
4. Add the deploy step to `.github/workflows/deploy.yml`.

#### Queue consumers

Queue consumers use the `queue()` handler export. Key settings in the wrangler toml:
- `max_batch_size` -- how many messages per invocation
- `max_retries` -- retry count before DLQ
- `max_concurrency` -- parallel invocations
- `dead_letter_queue` -- DLQ binding name

### packages/frontend

- **Framework**: React 19, React Router v6, TanStack Query v5, Zustand.
- **Build**: Vite. Config in `vite.config.ts`.
- **Styling**: Tailwind CSS v3 with OKLCH design tokens in `src/index.css`.
- **Deploy**: Cloudflare Pages.

#### Design system

Colors, fonts, and spacing are defined as CSS custom properties in `src/index.css` and extended in `tailwind.config.js`. Use the Tailwind tokens, not raw values:

```
text-ink, text-ink-2, text-ink-3     -- Text colors (dark to light)
bg-bg, bg-bg-2                       -- Backgrounds
border-rule, border-rule-2           -- Dividers
text-accent, bg-accent               -- Brand orange
font-mono, font-serif, font-sans     -- Typography
text-caps                            -- 11px mono label style
```

Three themes: default (warm), cool, mono. Applied via `html[data-theme]` attribute.

When building UI:
- Use the editorial/newspaper aesthetic. Think: specimen labels, figure numbers, monospace labels, large serif headlines.
- Pattern: `<div className="caps">` for section labels (e.g. "Fig. 003 -- Feature of the week").
- Links and CTAs use monospace uppercase with arrow entities (`&rarr;`).
- Use IntersectionObserver for infinite scroll (no "Load More" buttons).

#### Adding a new page

1. Create `src/pages/{PageName}.tsx`.
2. Add a route in `src/main.tsx`.
3. If the page uses data, create a hook in `src/hooks/use{Feature}.ts` using TanStack Query.
4. If the page needs auth, wrap with `useAuth()` check.

#### Version display

`__APP_VERSION__` is a build-time constant defined in `vite.config.ts` (reads from root `package.json`). It is displayed in the TopBar utility strip. Do not hardcode version strings.

### packages/mobile

- **Framework**: Expo 54, React Native 0.81, Expo Router v6.
- **Styling**: NativeWind v4 (Tailwind classes on RN) for simple components. `StyleSheet.create()` for complex components. Both patterns coexist.
- **State**: Zustand stores in `src/stores/`. TanStack Query for server data. MMKV for persistent local KV. SQLite for offline tables.
- **Fonts**: Instrument Serif, Inter, JetBrains Mono. Loaded in `app/_layout.tsx`. Theme constants in `src/constants/theme.ts`.
- **Import alias**: `@/` resolves to `src/`.
- **Auth**: Google OAuth via expo-web-browser. Token stored in expo-secure-store. Sent as `Authorization: Bearer` header.

#### Mobile theme

Use the theme constants from `src/constants/theme.ts`, not raw hex values:

```ts
import { colors, fonts, spacing, radius } from "@/constants/theme";
```

Color names: `colors.bg`, `colors.ink`, `colors.ink2`, `colors.accent`, `colors.rule`, etc.
Font names: `fonts.serif`, `fonts.sans`, `fonts.mono`, `fonts.sansMedium`.
Dark mode: `colors.dark.bg`, `colors.dark.ink`, etc.

#### Adding a new screen

1. Create `app/{screen-name}.tsx` (or `app/(tabs)/{name}.tsx` for tab screens).
2. Expo Router auto-registers file-based routes.
3. For data fetching, create a hook in `src/hooks/`.
4. Use `@/components/` for reusable components.
5. Touch targets must be at least 44pt (`minHeight: 44, minWidth: 44`).
6. Use `expo-haptics` for feedback on important actions.

#### Mobile version

Version comes from `app.json` `expo.version`, read via `expo-constants` at runtime. release-please updates this automatically. Do not hardcode.

## Database

### D1 databases

| Database | Directory | Used by |
|----------|-----------|---------|
| reduced-recipes-prod | `migrations/` | Recipes, tags, FTS, crawl queue, domains |
| reduced-recipes-users | `migrations-users/` | Users, auth, bookmarks, collections, shopping lists, votes |
| reduced-recipes-crawl | `migrations-crawl/` | Crawl pipeline state |
| reduced-recipes-funding | `migrations-funding/` | Donations, infra costs |

### Adding a migration

1. Create `{nnnn}_{description}.sql` in the correct directory (next number in sequence).
2. Write idempotent SQL (use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN` with existence checks where possible).
3. Test locally: `npx wrangler d1 migrations apply {db-name} --local --config packages/workers/wrangler.api.toml`
4. Migrations run automatically in CI via `deploy.yml`.

### KV namespaces

Key patterns:
- `recipe:{id}` in RECIPES_KV -- full RecipeDocument JSON
- `session:{token}` in SESSION_KV -- session data (1-year TTL)
- `user-sessions:{userId}` in SESSION_KV -- reverse index of user tokens
- `user-prefs:{userId}` in USER_CACHE_KV -- dietary prefs (10-min TTL)
- `cache:health` in CACHE_KV -- precomputed health stats

## Testing

### Framework and config

Vitest v3.2 with jsdom. Config in root `vitest.config.ts`. Setup file: `vitest.setup.ts`.

### Writing tests

- Frontend component tests use `@testing-library/react`.
- Mobile tests often use source-string assertions: `readFileSync(filePath, 'utf-8')` then `expect(src).toContain(...)`.
- Worker tests mock D1, KV, and Queue bindings. See existing tests for mock patterns.
- When testing components that use `IntersectionObserver`, mock it in a `beforeAll`:
  ```ts
  beforeAll(() => {
    globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
    }));
  });
  ```
- When testing worker endpoints, pass `executionCtx: { waitUntil: vi.fn() }` in the Hono request helper.

### Test file location

Tests live alongside source files or in `__tests__/` directories:
- `src/routes/shopping-lists.test.ts` (alongside source)
- `src/__tests__/home-screen.test.ts` (in __tests__ dir)
- `src/components/__tests__/RecipeCard.test.ts`

## CI/CD pipeline

```
PR opened -> ci.yml (typecheck + build + test)
PR merged to main -> deploy.yml (migrate DBs + deploy workers + deploy frontend)
                   -> release-please.yml (create/update release PR)
Release PR merged -> release-please creates v* tag
                  -> mobile.yml (EAS build + submit to App Store / Play Store)
```

### Secrets required (GitHub Actions)

- `CF_API_TOKEN`, `CF_ACCOUNT_ID` -- Cloudflare
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` -- OAuth
- `KOFI_VERIFICATION_TOKEN` -- Ko-Fi webhooks
- `EXPO_TOKEN` -- EAS builds
- `ASC_API_KEY_ID`, `ASC_API_KEY_ISSUER_ID`, `ASC_API_KEY` -- App Store Connect
- `GOOGLE_SERVICE_ACCOUNT_KEY` -- Play Store

## Common pitfalls

1. **pnpm-lock.yaml out of sync**: If you add/remove dependencies, run `pnpm install` and commit the lockfile. CI uses `--frozen-lockfile`.

2. **Missing vitest alias**: When importing a new `@rr/shared/*` sub-export, add the alias to `vitest.config.ts` too, or tests will fail with module-not-found.

3. **D1 in tests**: D1 is not available in vitest. All D1 access must be mocked. See `api.test.ts` for the mock pattern.

4. **Hono request helper**: The test helper `app.request(path, init, env, executionCtx)` takes `executionCtx` as the 4th argument, not inside `env`.

5. **NativeWind vs StyleSheet**: Some mobile components use NativeWind `className`, others use `StyleSheet.create()`. Check the source before writing tests -- don't assume one or the other.

6. **Font names**: Web uses CSS variable names (`var(--serif)`). Mobile uses Google Font export names (`InstrumentSerif_400Regular`). Never mix them.
