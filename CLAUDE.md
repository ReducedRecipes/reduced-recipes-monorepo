# ReducedRecipes Monorepo

Recipe index that strips SEO bloat from recipes, keeping only ingredients, steps, and timings.

## Quick reference

```
pnpm build          # shared -> workers -> frontend
pnpm typecheck      # all packages
pnpm test           # vitest across all packages
pnpm dev            # frontend dev server (Vite)
pnpm mobile         # Expo dev server
pnpm deploy         # deploy all 9 Cloudflare Workers
pnpm deploy:api     # deploy only rr-api
```

## Monorepo structure

```
packages/
  shared/      @rr/shared   — Types, extraction, dietary, unit normalisation
  workers/     @rr/workers  — 9 Cloudflare Workers (Hono API, crawl pipeline, crons)
  frontend/    @rr/frontend — React SPA (Vite + Tailwind + React Router)
  mobile/      @rr/mobile   — Expo React Native app (iOS/Android)
migrations/                  — D1 recipes DB
migrations-users/            — D1 users DB
migrations-crawl/            — D1 crawl DB
migrations-funding/          — D1 funding DB
scripts/                     — One-off scripts (seeding, backfills)
spec/                        — Architecture specs and feature docs
```

## Commit conventions

**Conventional Commits required** (release-please uses them for automated versioning):

- `feat: ...` -- new feature (minor bump)
- `fix: ...` -- bug fix (patch bump)
- `feat!: ...` or `BREAKING CHANGE:` -- major bump
- `chore:`, `docs:`, `refactor:`, `test:` -- no version bump

Never use em dashes in any written content.

## Versioning

Single monorepo version managed by release-please. The version in root `package.json` is the source of truth and is synced to all sub-packages and `packages/mobile/app.json` automatically via release PRs.

- Web reads version at build time via Vite `define` (`__APP_VERSION__` in `vite.config.ts`)
- Mobile reads version at runtime via `expo-constants` from `app.json`

## Architecture overview

### Workers (Cloudflare)

| Worker | File | Trigger | Purpose |
|--------|------|---------|---------|
| rr-api | `src/api.ts` | HTTP | Main API (Hono). All endpoints. |
| rr-orchestrator | `src/orchestrator.ts` | Cron 10min | Selects pending URLs, enqueues crawl jobs |
| rr-crawler | `src/crawler.ts` | Queue | Fetches HTML, checks robots.txt |
| rr-parser | `src/parser.ts` | Queue | Extracts Schema.org, detects language |
| rr-projection | `src/projection.ts` | Queue | Dedup, translate, embed, write D1+KV |
| rr-dlq | `src/dlq.ts` | Queue | Dead letter handler |
| rr-hot-refresh | `src/hot-refresh.ts` | Cron 1hr | Recompute Reddit-style hot_score |
| rr-billing | `src/billing-cron.ts` | Cron daily | Compute infra costs from CF Analytics |
| rr-sitemap | `src/sitemap-cron.ts` | Cron | Generate sitemaps |

Each worker has its own `wrangler.{name}.toml` config.

### Data stores

| Store | Type | Contents |
|-------|------|----------|
| DB (reduced-recipes-prod) | D1 | Recipes, tags, FTS, ingredients, crawl_queue, domains |
| USERS_DB (reduced-recipes-users) | D1 | Users, auth, collections, bookmarks, shopping lists, votes |
| CRAWL_DB (reduced-recipes-crawl) | D1 | Crawl pipeline state |
| FUNDING_DB (reduced-recipes-funding) | D1 | Donations, monthly costs |
| RECIPES_KV | KV | `recipe:{id}` -> full RecipeDocument JSON |
| CACHE_KV | KV | `html:{url}`, `cache:health` |
| SESSION_KV | KV | `session:{token}` -> user session |
| USER_CACHE_KV | KV | `user-prefs:{id}` -> dietary prefs |
| VOTES_KV | KV | `heart-rate:{userId}:{date}` -> rate limits |
| IMAGES_R2 | R2 | Recipe images |
| rr-recipes | Vectorize | 768-dim embeddings (EmbeddingGemma-300M) |

### Auth flow

Google OAuth with PKCE. Sessions stored in SESSION_KV (1-year TTL, refreshed on read). Web uses `__Host-session` cookie. Mobile uses `Authorization: Bearer` header stored in expo-secure-store.

### Recipe pipeline

```
Orchestrator (cron) -> crawl-jobs queue -> Crawler -> parse-jobs queue -> Parser -> projection-jobs queue -> Projection -> D1 + KV + Vectorize
```

Each stage has its own DLQ. Projection does: dedup, translate (Llama 3.1), dietary inference (Workers AI), embed, index ingredients, write FTS.

## Frontend (packages/frontend)

- **Stack**: React 19, React Router v6, TanStack Query v5, Zustand, Vite
- **Styling**: Tailwind CSS with OKLCH design tokens defined in `src/index.css`
- **Deploy**: Cloudflare Pages on push to `main`

### Design tokens (CSS variables)

```
--bg, --bg-2          Background
--ink, --ink-2, --ink-3    Text (dark to light)
--rule, --rule-2      Dividers
--accent, --accent-ink    Brand orange
--mono, --serif, --sans   Font stacks
```

Tailwind extends these: `text-ink-2`, `bg-accent`, `border-rule`, `font-mono`, `font-serif`.

Three themes: default (warm), cool, mono. Toggle via `html[data-theme]`.

### Key Tailwind utility

`text-caps` = 11px, 0.08em letter-spacing, 500 weight (used for labels).

## Mobile (packages/mobile)

- **Stack**: Expo 54, React Native 0.81, Expo Router v6
- **Styling**: NativeWind v4 (Tailwind on RN) + StyleSheet for complex components
- **State**: Zustand (auth, sync), TanStack Query (server), MMKV (persistent KV), SQLite (offline)
- **Fonts**: Instrument Serif, Inter, JetBrains Mono (via @expo-google-fonts)
- **Theme**: Defined in `src/constants/theme.ts` (colors, fonts, spacing, radius)
- **Import alias**: `@/` resolves to `src/`

### Mobile theme colors

```ts
colors.bg = "#F3F0EB"    colors.ink = "#2D2923"    colors.accent = "#C45A30"
colors.ink2 = "#5C5549"  colors.rule = "#D4CFC8"   colors.accentLight = "#F5E6DD"
```

Dark mode variants in `colors.dark.*`.

## Shared (packages/shared)

Multi-export package:

```ts
import type { RecipeSummary } from "@rr/shared";        // types
import { extractRecipe } from "@rr/shared/extract";      // extraction
import { parseRobotsTxt } from "@rr/shared/robots";
import { buildQuery } from "@rr/shared/build-query";
import { normaliseUnit } from "@rr/shared/unit-normalisation";
import { encodeDietary } from "@rr/shared/dietary";
```

## Testing

- **Framework**: Vitest v3.2 with jsdom environment
- **Config**: Root `vitest.config.ts` runs tests from all packages
- **Mocks**: Cloudflare Workers, Expo modules, React Native modules live in `src/lib/__mocks__/`
- **Pattern**: Most mobile/component tests use source-code string assertions (`readFileSync` + `expect(src).toContain(...)`)
- **IntersectionObserver**: Must be mocked in frontend tests that render RecipeGrid

Run tests: `pnpm test`
Run single file: `pnpm test -- path/to/file.test.ts`

## CI/CD

| Workflow | Trigger | Does |
|----------|---------|------|
| `ci.yml` | PR to main | Typecheck, build, test |
| `deploy.yml` | Push to main | Migrate DBs, deploy workers + frontend |
| `release-please.yml` | Push to main | Create/update release PR |
| `mobile.yml` | `v*` tag | EAS build iOS+Android, submit to stores |
| `deploy-preview.yml` | Manual | Preview environment deploy |

## Database migrations

Migrations are plain SQL in `migrations*/` directories. Applied via wrangler in CI:

```sh
npx wrangler d1 migrations apply reduced-recipes-prod --remote --config packages/workers/wrangler.api.toml
```

When adding a new migration, create a numbered SQL file (e.g. `0007_feature_name.sql`) in the appropriate directory.
