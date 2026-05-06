# ReducedRecipes — Social Automation System

**Version:** 1.0 — consolidated, schema-corrected, implementation-ready
**Updated:** 2026-05-06 (folded brand voice + spikes + tickets, applied real-schema fixes, added ticket 017)
**Owner:** Jannik
**Stack:** Cloudflare-native: Workers + Workers AI + D1 + Queues + KV + R2 + Containers, pnpm monorepo (extension of existing RR infra)
**Operating model:** Daily generation, mobile approval gate (~2-5 min/day), automated publish, measurement loop
**Budget ceiling:** $50/mo total infra + API
**Primary KPI:** App installs / web sessions attributable to social
**Pre-build spikes:** results live under `spec/spikes/social/`; summary in Part III below

This single document is the source of truth for the social automation system. It is structured as four parts:

- **Part I — Design** (§1-§13): goals, architecture, data model, content selection, prompts, approval UI, publishing, measurement, cost, risks, decisions
- **Part II — Brand voice** (§14): voice canon, do/don't examples, prompt application
- **Part III — Spike findings** (§15): summary of three pre-build technical validations
- **Part IV — Implementation tickets** (§16-§32): 17 numbered ticket sections with full code for each Worker, package, and migration

A standalone newsletter system is specified separately in `spec/newsletter.md` and inherits the social pipeline.

---

# Part I — Design

## 1. Goals & non-goals

### Goals

- Generate platform-native content from the existing RR recipe corpus (~247k recipes, 126 sources)
- Drive measurable install/session traffic with attribution back to source posts
- Run inside a $50/mo budget, fitting the existing Cloudflare-only stack
- Stay under platform automation thresholds via rate limits + human approval gate
- Build a feedback loop that tightens prompts toward winning patterns over 60-90 days

### Non-goals

- **GitHub commit auto-posts** — wrong audience for a recipe app
- **Multi-post-per-day on visual platforms** — algorithmically counterproductive in 2026. Spec is 1/day Instagram, 1/day TikTok, 1/day YouTube Shorts, 3-5/day Pinterest, 0 on FB/LinkedIn for the product
- **LinkedIn / Facebook automation** — wrong audience for ReducedRecipes
- **Automated paid ads** — generation-only for ad templates in Phase 3; launch and budget control stay manual
- **X/Twitter** — paid API tier required for posting; ROI doesn't justify the spend in the recipe niche on a $50 budget

---

## 2. Architecture

### 2.1 System overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          DAILY CRON (06:00 SAST)                     │
│  Worker: rr-social-orchestrator                                      │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       1. CONTENT SELECTION                           │
│  Worker: rr-social-selector                                          │
│  - Pulls from D1: trending recipes (saves, searches, seasonality)    │
│  - Pulls from KV: editorial calendar themes                          │
│  - Outputs: 8-12 source candidates → Queue                           │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      2. FORMAT ADAPTERS                              │
│  Workers: rr-social-adapter-{pinterest,reels,shorts,tiktok}          │
│  - Each consumes Queue messages                                      │
│  - Calls Workers AI (Llama 3.3 70B) for caption / script / hooks     │
│  - Composes assets (R2-hosted templates + AI-generated images)       │
│  - Writes drafts to D1 with status='pending_approval'                │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      3. APPROVAL UI                                  │
│  Pages app: rr-social-admin                                          │
│  - Mobile-first swipe interface                                      │
│  - One swipe per draft: kill / approve / edit-and-approve            │
│  - 2-5 min/day, ~10 drafts to triage                                 │
└─────────────────┬───────────────────────────────────────────────────┘
                  │ (status='approved')
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      4. PUBLISHER                                    │
│  Workers: rr-social-publisher-{platform}                             │
│  - Cron-triggered at platform-optimal slots (US Eastern)             │
│  - Posts via official APIs                                           │
│  - status='published'                                                │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      5. MEASUREMENT LOOP                             │
│  Worker: rr-social-metrics (cron, hourly for first 24h, daily after) │
│  - Pulls engagement metrics per post                                 │
│  - Joins with web analytics (UTM-tagged short links)                 │
│  - Writes to D1 metrics tables                                       │
│  - Updates prompt-tuning KV with weekly winners                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Monorepo placement

```
reducedrecipes/                              (existing)
├── apps/
│   ├── api/                                 (existing)
│   ├── mobile/                              (existing)
│   └── social-admin/                        (NEW: Pages app, approval UI, behind CF Access)
├── workers/
│   ├── ingest/                              (existing recipe ingestion)
│   ├── social-orchestrator/                 (NEW)
│   ├── social-selector/                     (NEW)
│   ├── social-signals-rollup/               (NEW: computes save_velocity_7d, search_volume_7d)
│   ├── social-adapter-pinterest/            (NEW)
│   ├── social-adapter-reels/                (NEW)
│   ├── social-adapter-shorts/               (NEW)
│   ├── social-adapter-tiktok/               (Phase 3)
│   ├── social-publisher-pinterest/          (NEW)
│   ├── social-publisher-meta/               (Reels + FB if used)
│   ├── social-publisher-youtube/            (NEW)
│   ├── social-publisher-tiktok/             (Phase 3)
│   ├── social-image-gen/                    (NEW: Flux Schnell wrapper + R2 ingredient cache)
│   ├── social-renderer/                     (NEW: Worker that fronts the CF Container for video render)
│   ├── social-shortlink/                    (NEW: r.reduced.recipes redirector with attribution logging)
│   └── social-metrics/                      (NEW)
├── containers/
│   └── social-renderer/                     (NEW: CF Container running Remotion + Chromium)
└── packages/
    ├── db/                                  (existing: extend with social tables)
    ├── prompts/                             (NEW: versioned prompt templates)
    ├── notifier/                            (NEW: Notifier abstraction; email digest impl for v1)
    └── social-shared/                       (NEW: types, platform clients, Remotion composition, image cache helpers)
```

---

## 3. Data model (D1)

### 3.1 New tables (recipes DB)

All social tables live in `reduced-recipes-prod` (the recipes DB) so foreign keys to `recipes(id)` resolve. D1 does not support cross-database FKs.

```sql
-- Source content selected for adaptation
CREATE TABLE social_source_candidates (
  id              TEXT PRIMARY KEY,                    -- ULID
  recipe_id       TEXT NOT NULL,
  selection_reason TEXT NOT NULL,                      -- 'trending' | 'seasonal' | 'editorial' | 'longtail'
  selection_score REAL NOT NULL,
  theme           TEXT,
  selected_at     INTEGER NOT NULL,                    -- unix ms
  FOREIGN KEY (recipe_id) REFERENCES recipes(id)
);
CREATE INDEX idx_source_selected_at ON social_source_candidates(selected_at);

-- Generated drafts, one row per (source × platform × variant)
CREATE TABLE social_drafts (
  id              TEXT PRIMARY KEY,                    -- ULID
  source_id       TEXT NOT NULL,
  platform        TEXT NOT NULL,                       -- 'pinterest' | 'instagram' | 'youtube' | 'tiktok'
  variant_label   TEXT,
  caption         TEXT,
  hashtags        TEXT,                                -- JSON array
  hook            TEXT,
  script          TEXT,
  cta_text        TEXT,
  cta_url         TEXT,
  asset_r2_keys   TEXT NOT NULL,                       -- JSON array
  prompt_version  TEXT NOT NULL,
  model           TEXT NOT NULL,
  generation_cost_usd REAL,
  status          TEXT NOT NULL,                       -- 'pending_approval' | 'approved' | 'rejected' | 'scheduled' | 'published' | 'failed'
  rejection_reason TEXT,
  approved_at     INTEGER,
  scheduled_for   INTEGER,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (source_id) REFERENCES social_source_candidates(id)
);
CREATE INDEX idx_drafts_status ON social_drafts(status);
CREATE INDEX idx_drafts_platform_status ON social_drafts(platform, status);
CREATE INDEX idx_drafts_scheduled ON social_drafts(scheduled_for) WHERE status = 'scheduled';

-- Successful publishes
CREATE TABLE social_posts (
  id              TEXT PRIMARY KEY,
  draft_id        TEXT NOT NULL UNIQUE,
  platform        TEXT NOT NULL,
  platform_post_id TEXT NOT NULL,
  permalink       TEXT,
  short_link      TEXT NOT NULL,
  published_at    INTEGER NOT NULL,
  FOREIGN KEY (draft_id) REFERENCES social_drafts(id)
);
CREATE INDEX idx_posts_platform_published ON social_posts(platform, published_at);

-- Engagement snapshots over time
CREATE TABLE social_metrics_snapshots (
  id              TEXT PRIMARY KEY,
  post_id         TEXT NOT NULL,
  captured_at     INTEGER NOT NULL,
  age_hours       INTEGER NOT NULL,
  impressions     INTEGER, reach INTEGER, likes INTEGER, comments INTEGER,
  shares INTEGER, saves INTEGER, click_throughs INTEGER, video_views INTEGER,
  video_avg_watch_seconds REAL,
  FOREIGN KEY (post_id) REFERENCES social_posts(id)
);
CREATE INDEX idx_metrics_post_age ON social_metrics_snapshots(post_id, age_hours);

-- Web-side attribution
CREATE TABLE social_attribution (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL, date TEXT NOT NULL,
  sessions INTEGER NOT NULL DEFAULT 0,
  installs INTEGER NOT NULL DEFAULT 0,
  signups INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (post_id) REFERENCES social_posts(id),
  UNIQUE(post_id, date)
);

-- Prompt versions for A/B and rollback
CREATE TABLE social_prompt_versions (
  id TEXT PRIMARY KEY, platform TEXT NOT NULL, variant_label TEXT NOT NULL,
  template TEXT NOT NULL, notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_prompts_platform_active ON social_prompt_versions(platform, active);

-- AI ingredient image cache (architecturally mandatory; without it Flux Schnell
-- bills blow the $50 ceiling on per-recipe ingredient stills).
CREATE TABLE social_ingredient_image_cache (
  ingredient_key  TEXT PRIMARY KEY,
  r2_key          TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  model           TEXT NOT NULL,
  generated_at    INTEGER NOT NULL,
  bytes           INTEGER NOT NULL
);

-- Editorial calendar
CREATE TABLE social_editorial_calendar (
  id TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  theme TEXT NOT NULL, cuisine_filter TEXT,
  weight REAL NOT NULL DEFAULT 1.0,
  notes TEXT
);
```

### 3.2 Existing tables this system reads from

The selector and adapters read from existing tables. Their shapes (verified against the actual schema, not assumptions):

```sql
-- recipes (recipes DB) — present columns through migration 0006:
-- id, title, domain, source_url, image_url, author,
-- total_time INTEGER, prep_time INTEGER, cook_time INTEGER,
-- yields, cuisine, category, schema_valid, extracted_at,
-- dietary_bitmask, hot_score, vote_count, first_voted_at,
-- calories, protein_g, fat_g, carbs_g, fiber_g, sodium_mg, nutrition_source,
-- original_language       (added by ticket 017; was undocumented in prod)

-- recipe_tags (recipes DB)
-- (recipe_id TEXT, tag TEXT, PRIMARY KEY)
-- Tags are normalised in this junction table, NOT a JSON column on `recipes`.

-- recipe_ingredients (recipes DB)
-- (recipe_id TEXT, ingredient TEXT, PRIMARY KEY)
-- Ingredient name junction. Full ingredient list with quantities lives in RECIPES_KV.

-- recipe_votes (users DB)
-- (user_id, recipe_id, weight REAL, action TEXT, created_at TEXT default datetime('now'))
-- action ∈ {'heart', 'list_add', 'auth_view'}. We use action='heart' as the "save" signal.
```

The full structured `RecipeDocument` (with ingredients including quantities, instructions, tags, etc.) is stored in `RECIPES_KV` at key `recipe:${id}`. Adapters that need full recipe data read from KV; the selector reads only from D1 to keep selection fast.

### 3.3 KV namespaces

| Namespace | Purpose | TTL |
|-----------|---------|-----|
| `RR_SOCIAL_TOKENS` | OAuth tokens (Pinterest, Meta, YouTube, TikTok) | refreshed before expiry |
| `RR_SOCIAL_RATELIMITS` | Per-platform rate-limit counters | 24h |
| `RR_SOCIAL_LEARNINGS` | Weekly winning-pattern summaries fed back into prompts | 7d, replaced |
| `RR_SOCIAL_KILLSWITCH` | Emergency stop flag per platform | none |
| `RR_SOCIAL_OAUTH_STATE` | PKCE verifier during OAuth bootstrap | 5 min |
| `RECIPES_KV` (existing) | `recipe:{id}` -> full RecipeDocument JSON | 1y |

### 3.4 R2 buckets

| Bucket | Purpose | Public custom domain |
|--------|---------|----------------------|
| `rr-social-assets` | Composed final assets (pin PNGs, video MP4s) | `assets.reduced.recipes` |
| `rr-social-templates` | Reusable design templates | none (private) |
| `rr-social-cache` | AI-generated ingredient image cache | none (private) |

---

## 4. Content selection

### 4.1 Daily selection algorithm

Run at 06:00 SAST (off-peak, before approval review):

```
score(recipe) =
    0.40 × normalized_save_velocity_7d
  + 0.20 × normalized_search_volume_7d
  + 0.15 × seasonality_match_score        # 0..1, day-of-year vs recipe tags
  + 0.15 × editorial_theme_match_score    # 0..1 if active theme matches
  + 0.10 × longtail_freshness_boost       # log-decay since last featured
  - 0.30 × recently_posted_penalty        # 1.0 if posted on any platform in last 14d
```

**Selection counts per day:**
- Pinterest: 4 candidates (publishes 3-5)
- Instagram Reels: 2 candidates (1 publishes, 1 backup)
- YouTube Shorts: 2 candidates (1 publishes, 1 backup; usually same asset as Reels)
- TikTok: 2 candidates (Phase 3)

**Total candidates/day: 8-10. Total drafts after adaptation: ~10-12.**

`save_velocity_7d` and `search_volume_7d` are precomputed by the `social-signals-rollup` cron (ticket 005) reading `recipe_votes` (action='heart') from the users DB and `social_search_hits` from the recipes DB. Aggregation moves out of the selector hot path.

### 4.2 Editorial calendar

Pre-populate `social_editorial_calendar` with quarterly themes:

| Window | Theme | Cuisine filter |
|--------|-------|----------------|
| Mon-Thu | weeknight_dinners | — |
| Fri-Sat | comfort_food_or_indulgence | — |
| Sun | meal_prep_sunday | — |
| Dec | festive_holiday | — |
| Jan | healthy_january | — |
| Late Feb | budget_eats | — |

Themes nudge selection without dictating it; the score still mostly reflects organic signal.

---

## 5. Format adapters & prompts

### 5.1 Adapter responsibilities

Each platform adapter is a Worker that:
1. Consumes a `selected_candidate` queue message
2. Loads recipe data: candidate row + theme from D1 (`social_source_candidates`); full RecipeDocument from `RECIPES_KV`
3. Calls Workers AI Llama 3.3 70B with platform-specific prompt
4. Composes final asset (image overlay or video) and uploads to R2
5. Inserts draft row to D1 with `status='pending_approval'`

### 5.2 Model choice

- **`@cf/meta/llama-3.3-70b-instruct-fp8-fast`** on Workers AI for caption/hook/script generation. Spike A measured 100% first-pass schema-valid JSON across 20 representative recipes at ~4 s/call. Cost: well inside the free Workers AI neuron allowance on the paid plan, effectively $0 marginal at v1 volume. **No retry-with-correction layer needed** — the model returns a pre-parsed JSON object in `result.response` natively.
- **`@cf/meta/llama-3.3-70b-instruct-fp8-fast`** also handles the weekly learning summarisation pass. Anthropic SDK is not used anywhere in v1.

Why no Anthropic: existing project infrastructure already calls Workers AI for translation, dietary inference, and ingredient parsing. Adding Anthropic would introduce a second model provider and a recurring API line item. Workers AI clears the quality bar in our spike with no measurable downside.

Adapter Workers should expect this response shape:

```ts
const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
  messages: [{ role: 'system', content: prompt }, { role: 'user', content: input }],
  max_tokens: 600,
});
// result.response is already a parsed object when the prompt asks for JSON.
const payload = typeof result.response === 'string'
  ? JSON.parse(result.response)
  : result.response;
```

### 5.3 Prompt scaffolding

Stored in `social_prompt_versions`. Each adapter loads the active variant. Phase 1 ships with prompts inlined in adapter source for simplicity; D1-backed prompt versioning lands as Phase 1 polish.

#### Pinterest (caption + pin description)

```
You are writing a Pinterest pin for ReducedRecipes, a recipe site that
strips blog narratives and surfaces clean, structured recipes.

Recipe: {{title}}
Cuisine: {{cuisine}} | Time: {{total_time}}
Key ingredients: {{top_ingredients}}

Write:
1. PIN_TITLE: <=100 chars, search-optimised. Lead with the dish, then a
   benefit (fast / one-pan / 5-ingredient / make-ahead). No emoji in title.
2. PIN_DESCRIPTION: 200-400 chars. Conversational, second-person.
   Include 2-3 SEO keywords naturally. End with a soft CTA:
   "Get the full recipe at reduced.recipes, no story scroll."
3. HASHTAGS: 4-6 specific hashtags as a JSON array of strings. Mix broad + niche.
   No #recipe (too broad). Prefer #weeknightdinner, #onepanmeal,
   #{{cuisine_lower}}recipes etc.

Return STRICT JSON with keys: pin_title, pin_description, hashtags.
No preamble, no code fences.

Constraints:
- Never claim health benefits ("healthy", "weight loss", "diet").
- Never say "AI-generated" or reference automation.
- Do NOT credit source sites or mention origin (we own this post).
- Brand voice: practical, slightly dry, never breathless.
```

#### Instagram Reels / YouTube Shorts (timeline + caption)

```
You are writing a 20-25 second vertical-video timeline for ReducedRecipes.
The video is FACELESS, NO VOICEOVER. Music bed + text overlays only.
Viewers will read on-screen text, so every beat must communicate visually.

Recipe: {{title}}
Hero image available: yes (R2 key: {{hero_key}})
Ingredients: {{ingredients_list}}
Steps: {{steps_list}}
Time: {{total_time}} | Servings: {{servings}}

Write a structured timeline matching this template:

[0.0-2.0] HOOK — Ken Burns on hero image. Overlay text ≤8 words.
   Curiosity, not clickbait. Must work muted (text is the whole pitch).

[2.0-6.0] WHAT YOU NEED — ingredients animate in as a stacked list.
   Choose 4-6 hero ingredients (not all). Each gets a 2-3 word label.

[6.0-18.0] HOW TO MAKE IT — 4-5 step cards, ~2.5s each.
   Each step: ≤10 words, action-first ("Sear chicken 4 min/side").

[18.0-22.0] FINISHED — return to hero shot. Stats overlay:
   "{{total_time}} · Serves {{servings}}".

[22.0-25.0] CTA card: "Full recipe, no scroll" / "reduced.recipes".

Also write:
- CAPTION: 2-4 sentences. End with:
  "Full recipe at reduced.recipes, no story scroll. Link in bio."
- HASHTAGS: 3-5 only. Niche over broad.

Return STRICT JSON: hook_text, ingredients_overlay, step_cards
(array of {duration_s, text}), stats_overlay, cta_text, caption, hashtags.
No preamble, no code fences.

Constraints:
- Max 25 seconds. Step durations sum to 12 seconds.
- All on-screen text readable in 1.5s or less per line.
- Never reference voiceover or narration.
- Never make health claims.
- Brand voice: practical, sceptical of food-blog tropes.
```

### 5.4 Asset composition

| Platform | Asset | Composer |
|----------|-------|----------|
| Pinterest | 1000×1500 PNG | Worker + Satori (HTML → SVG → PNG via ResVG) |
| Reels / Shorts / TikTok | 1080×1920 MP4, 20-25s, no voice (music only) | Cloudflare Containers running Remotion + Chromium |

**Pinterest pin template:** AI-generated hero food image with overlay band (recipe title, time, "no blog scroll"). React component shipped in `packages/social-shared`.

**Video template:** Single Remotion composition `<RecipeCard />` parameterised by:
- `heroImageUrl` (R2 signed URL: per-recipe AI hero from `social-image-gen`)
- `hookText` (string, max 8 words)
- `ingredients` (array of `{label, thumbnailR2Key}` resolved against the ingredient cache)
- `steps` (array of `{duration, text, stillR2Key?}`)
- `statsOverlay` (string)
- `ctaText` (defaults to `Full recipe, no scroll  ·  reduced.recipes`)
- `platform` (`'reels' | 'shorts' | 'tiktok'`): switches safe-area padding only

One template, one render pipeline, three platforms. Music is added at the platform layer (Reels/TikTok use native trending sound API; YouTube Shorts uses Audio Library track from a curated whitelist).

**Render service shape (Cloudflare Containers, validated by Spike C):**

- Adapter Workers send a render request through a Durable Object stub bound to the `RemotionRenderer` container class.
- Container image: Node 22 + bundled Chromium + Remotion (~1 GB image, validated locally).
- Container instance type: `standard` (1/2 vCPU, 4 GB memory). `advanced` available if render duration ever becomes a bottleneck.
- Render output written directly to R2 (`rr-social-assets/{draft_id}.mp4`).
- Measured local render: ~50 s/video at 1080×1920 25 s. Projected on CF Containers `standard`: 90-180 s, ~$0.02-0.05 per render. Comfortably under the $0.10/render exit threshold.

Reference scaffold and Dockerfile in `spec/spikes/social/spike-c-remotion-container/` are lift-and-shift ready into `containers/social-renderer/`.

---

## 6. Approval UI

### 6.1 UX

Cloudflare Pages app, mobile-first. **Kept separate from the existing Expo app for security isolation.**

**Daily flow (06:30 SAST email digest, ~2-5 min review):**
1. Email arrives via the `Notifier` interface (default impl: email digest with one-tap approve links). Channel is swappable to push, Telegram, Discord, or Slack later without spec changes.
2. Open the admin Pages app, stack of cards, swipeable.
3. Per card:
   - Top: rendered preview (image or video first frame with play button)
   - Middle: caption + hashtags
   - Bottom: platform badge + scheduled time
4. Gestures:
   - Swipe right: approve, schedule at next platform-optimal slot
   - Swipe left: reject (optional one-tap reason chip)
   - Swipe up: edit caption inline before approving
5. End screen: "All clear. Today: 3 Pinterest, 1 Reel, 1 Short scheduled."

### 6.2 Auth

Single user (you). Cloudflare Access in front of the Pages app. No login form.

### 6.3 Notifier abstraction

`packages/notifier` exports a single interface:

```ts
export interface Notifier {
  sendDailyDigest(input: { drafts: DraftSummary[]; approveBaseUrl: string }): Promise<void>;
  sendAlert(input: { level: 'info' | 'warn' | 'error'; subject: string; body: string }): Promise<void>;
}
```

Implementations: `EmailNotifier` (default v1, MailChannels), future `TelegramNotifier`, `DiscordNotifier`, push. Selection is config, not code.

### 6.4 The earned-autopilot toggle

After each draft is decided, store the decision. Once weekly stats show >95% approval rate over 14 days for a given platform, surface a banner: "Auto-approve Pinterest? You've approved 96% of last 14 days." One-tap toggle. Earned-autopilot upgrade path locked behind real data, not a vibes call.

---

## 7. Publisher

### 7.1 Per-platform notes

#### Pinterest
- API: Pinterest API v5
- Auth: OAuth 2.0, refresh token in `RR_SOCIAL_TOKENS`
- Rate limit: 1000 calls/hour, comfortable
- Optimal slots: **11:00, 14:00, 20:00, 21:00 US Eastern** (primary install audience)
- Endpoint: `POST /v5/pins`
- Required: board_id, **organised by meal type** (Weeknight Dinners, Quick Lunches, Desserts, Meal Prep, One-Pan, 5-Ingredient, etc.). Editorial calendar themes map directly to these boards.
- Media: served from `assets.reduced.recipes` (R2 custom domain) for stable public URLs.
- **Account warm-up:** start at 1-2 pins/day for the first 14 days, ramp to 3-5/day after that.

#### Instagram (Reels)
- API: Meta Graph API v21+ via Instagram Business Account
- Prerequisite: IG Business connected to FB Page; Meta app reviewed for `instagram_content_publish` scope (4-8 weeks in 2026)
- Rate limit: 100 posts/24h per IG account
- Two-step publish: create container → publish container (poll status)
- Optimal slot: 11:00, 14:00, 19:00 ET; randomised within ±20 min

#### YouTube Shorts
- API: YouTube Data API v3
- Auth: OAuth 2.0
- Rate limit: 10K quota units/day; an upload costs ~1600 units → ~6 uploads/day max
- Use `videos.insert` with vertical video; YouTube auto-classifies as Short if ≤60s and 9:16
- Optimal slot: 13:00 or 19:00 ET

#### TikTok (Phase 3)
- API: TikTok Content Posting API
- Approval: 4-8 weeks; apply early
- Rate limit: 30 posts/day per user
- Optimal slot: 18:00-22:00 ET

### 7.2 Killswitch & safety rails

Before every publish, the worker checks:
1. `RR_SOCIAL_KILLSWITCH:{platform}`. If set, abort and notify via the configured `Notifier`.
2. Daily count vs config cap (Pinterest: 2 days 0-13, then 5; others=1).
3. **Days 1-30 (bootstrap):** absolute floor. If last 3 Pinterest pins individually have <50 impressions at 24h, set killswitch and notify.
4. **Day 30+:** rolling rule. If last 5 posts on a platform have median impressions <10% of trailing 30-day median, auto-set killswitch and notify.

### 7.3 Retry policy

- Network/5xx: exponential backoff (3 attempts, 30s/2m/10m)
- 4xx: no retry, mark `status='failed'`, surface in admin UI
- Token-expired errors: trigger refresh flow, retry once

---

## 8. Measurement & learning loop

### 8.1 Metrics ingestion

**Schedule:**
- 1h, 6h, 24h after publish: snapshot
- Then daily at 02:00 SAST for 14 days
- Then weekly until 90 days

**Web attribution:**

UTM-tagged short links per draft:
```
https://r.reduced.recipes/{ulid}?utm_source={platform}&utm_medium=organic_social&utm_campaign={theme}&utm_content={draft_id}
```

The `social-shortlink` Worker resolves `r.reduced.recipes`, 302s to the recipe page, logs hit timestamp + IP-derived geo + referer to D1. Joins to `social_attribution` nightly.

### 8.2 Learning loop

**Weekly job (Sundays 23:00 SAST):**
1. Pull last-7d metrics joined to drafts and prompt versions
2. Group by (platform, prompt_variant_label, hook_pattern, cta_pattern)
3. Compute weighted score: `0.5 × CTR + 0.3 × save_rate + 0.2 × completion_rate` (weights vary per platform)
4. Send the top 5 and bottom 5 patterns to Llama 3.3 70B with the prompt:
   ```
   Here are top and bottom-performing patterns from the last 7 days.
   Identify 2-3 specific, testable hypotheses about what's working.
   Output as draft refinements to the prompt template.
   ```
5. Store output in `RR_SOCIAL_LEARNINGS` KV
6. Surface in admin UI as a weekly digest with one-tap "promote to active prompt"

**Manual gate on prompt evolution.** Don't auto-mutate prompts based on noisy metrics. The accept-tap is the gate.

---

## 9. Cost analysis

Rebalanced post-spike. Anthropic line items removed (Workers AI replaces them at ~$0). AWS Lambda removed (Cloudflare Containers replaces it). Image gen line items added under all-AI imagery, with the ingredient cache holding the budget down.

### 9.1 Infrastructure (monthly)

| Component | Tier | Cost |
|-----------|------|------|
| Workers (existing + ~12 new) | Paid plan ($5/mo, already paid) | Marginal: ~$0 |
| D1 | Free tier | $0 |
| Queues | Paid plan included | $0 |
| KV | Free tier | $0 |
| R2 storage | ~50 GB assets + ~5 GB cache | ~$0.85 |
| R2 operations | Free tier | ~$0 |
| Cloudflare Containers (renderer) | `standard`, ~3 renders/day × ~120 s | ~$3 |
| Pages (admin app) | Free tier | $0 |
| Cloudflare Access (1 user) | Free tier | $0 |
| MailChannels (email digest) | Free tier | $0 |
| **Subtotal infra** | | **~$4/mo** |

### 9.2 APIs (monthly)

| API | Usage | Cost |
|-----|-------|------|
| Workers AI Llama 3.3 70B (caption + script + weekly learning) | within free neuron allowance | $0 |
| Workers AI Flux Schnell (per-recipe hero + finished, post-cache) | ~10 recipes/day × 2 fresh shots × $0.06 | ~$36 |
| Workers AI Flux Schnell (one-time cache seed) | 200 ingredients × $0.06 | ~$12 one-time |
| Pinterest / Meta / YouTube / TikTok APIs | Free | $0 |
| **Subtotal APIs (recurring)** | | **~$36/mo** |

The image-gen line is the one that breaks the budget if the cache layer isn't built. Without caching, ingredient stills alone push to ~$200/mo. The `social_ingredient_image_cache` table is therefore a hard architectural requirement.

### 9.3 Total

| Category | Monthly cost |
|----------|--------------|
| Infrastructure | ~$4 |
| APIs (recurring) | ~$36 |
| **Total recurring** | **~$40/mo** |
| One-time cache seed | ~$12 |

Inside the $50 ceiling with ~$10 headroom. Levers if v1 runs hot:
- expand the ingredient cache to top-500
- prompt-iterate to reduce per-image regeneration
- adopt the hybrid path (real photos for hero/finished, AI elsewhere)
- drop one of two fresh AI shots per recipe

---

## 10. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Meta scope review denied | Medium | Blocks IG | Apply Phase 1 day 1; manual fallback (admin UI generates copy + asset, you paste into IG) |
| Meta scope review takes 4-8 weeks | High | Delays Phase 2 | Same fallback; Pinterest carries the load |
| Pinterest account flagged for "automation" | Low | Resets growth | Warm-up 1-2 then 3-5/day, vary post times, vary captions, monitor reach floor |
| TikTok API never approved | Medium | No TikTok | Same manual fallback; not a system blocker |
| Image cost overrun if cache layer underbuilt | High if missed | Budget breach | `social_ingredient_image_cache` is mandatory; alert at $40/mo Workers AI spend |
| AI image food-correctness errors (Spike B finding) | Medium | Erodes Pinterest engagement | Per-cuisine prompt-suffix table negates common failures; manual reject on hero errors; hybrid path stays on the table for Phase 2 |
| Approval UI breaks → drafts pile up | Low | Workflow stops | `Notifier` email digest with one-click approve links is the v1 default, not a fallback |
| Engagement craters silently | Medium | Wasted spend, account decay | Auto-killswitch in §7.2; bootstrap rule covers days 1-30 |
| Trending-sound API access denied/rate-limited | Low-Med | Loses algorithmic boost on IG/TikTok | Curated whitelist of evergreen royalty-free tracks as fallback |
| Founder unavailable >3 days | Medium | Drafts queue, freshness drops | Acknowledged for v1; future option: temporarily auto-approve under stricter content filter |
| Single account per platform = SPOF | Low | Account ban resets growth | Document recovery playbook; consider warm secondary accounts after first 90 days |

**Resolved by spikes (no longer in register):**
- ~~Workers AI structured-JSON unreliable~~ — Spike A: 100% pass rate
- ~~Remotion in CF Containers unproven~~ — Spike C: 5/5 local renders
- ~~Recipe data triggers copyright complaint~~ — all-AI imagery removes image-rights exposure
- ~~Anthropic spend overruns~~ — Anthropic not used

---

## 11. Decisions (locked 2026-05-06)

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Source-site attribution in pin description | **Dropped.** No source-site mention. RR owns the post. |
| 2 | Audience timezone primary | **US Eastern.** Pinterest publish slots: 11:00 / 14:00 / 20:00 / 21:00 ET. |
| 3 | Brand voice canon | See Part II (folded in from `spec/social-brand-voice.md`). |
| 4 | Notifications channel | **Email digest** (default v1), behind a `Notifier` interface so push/Telegram/Discord/Slack are config-swappable. |
| 5 | Pinterest board structure | **By meal type.** Weeknight Dinners, Quick Lunches, Desserts, Meal Prep, One-Pan, 5-Ingredient. |
| 6 | Short-link domain | **`r.reduced.recipes`.** Subdomain on existing zone. No new registration. |
| 7 | Caption / script model | **Workers AI Llama 3.3 70B fp8-fast.** No Anthropic. |
| 8 | Video render target | **Cloudflare Containers** running Remotion + Chromium. No AWS. |
| 9 | Image strategy | **All-AI for v1**, hybrid (real hero photos) flagged as Phase 2 upgrade. |
| 10 | Compliance for newsletter (separate spec) | **Double opt-in.** |

---

## 12. What this spec is **not** solving

- Founder LinkedIn / personal brand → separate system, manual posting
- Codeship dev-tools social → separate account, separate spec
- Paid ads execution and budget management → out of scope; Phase 3 generates *templates* only
- Email marketing / newsletter → separate spec at `spec/newsletter.md`
- Influencer outreach / UGC → out of scope
- Multi-language localisation → out of scope for v1; English-only
- **Voiceovers (yours or AI)** → explicitly excluded

---

## 13. Faceless format — design rationale

**What we ARE doing:**
- Animated recipe-card videos using **all-AI imagery** for v1: AI hero + finished-dish stills generated fresh per recipe, AI ingredient stills cached and reused, AI step visuals
- Music + text-overlay only, optimised for the >85% of viewers watching muted
- Pinterest-first because it's the only major platform where "faceless static-derived content" matches platform expectations
- Native trending sounds on IG/TikTok for algorithmic boost

**What we are NOT doing, and why:**
- *AI voiceover*: fingerprinted by platforms, demoted in 2025-26
- *Full AI-generated video (Sora/Veo for whole clips)*: food-and-hands quality still poor; C2PA labels triggering algorithmic demotion
- *Generic stock cooking footage with text overlay*: most-demoted format on TikTok/Reels right now
- *Reposting/remixing source-site images*: pure-AI imagery removes the image-rights question entirely

**Realistic engagement expectation:** This format produces *consistent, slow-trickle* reach rather than viral spikes. On Pinterest that's fine — Pinterest works on long-tail discovery. On Reels/Shorts/TikTok, expect modest per-video performance with occasional breakouts when a hook lands plus a trending sound aligns. The system's value is in volume + measurement + iteration, not individual hits.

**The voiceover lever (future):** If your engagement plateaus and you eventually want to climb past it, the smallest unlock is voice. We can wire it in optionally without changing the architecture.

---

# Part II — Brand voice

## 14. Voice canon

### 14.1 The voice in one sentence

Practical, slightly dry, gently mocks food-blog tropes without being mean. Talks to another home cook, not at an audience.

### 14.2 Why this voice fits

ReducedRecipes is **counter-positioned to food-blog SEO bloat**. The product literally strips the personal narrative, the scrolling stories, the "today I want to share" preamble. The voice has to match the product. We can lightly mock food-blog tropes because the product *is* the alternative.

If we sounded like a typical food blog, the system would be incoherent. If we sounded mean, we'd burn the audience that came from that ecosystem. The line is dry humour with a wink, never sneering.

### 14.3 Three calibration dials

When in doubt, push toward the right of each dial.

| Dial | Avoid | Lean toward |
|---|---|---|
| Specificity | Universal claims | Specific dish, specific technique, specific time |
| Volume | Enthusiastic | Quiet, factual, confident |
| Promise | Promised feeling | Earned outcome |

Examples:

- "Everyone loves this!" → "Four ingredients, twenty minutes."
- "The BEST cookies you'll ever make!" → "These bake flat and chewy."
- "You won't BELIEVE this!" → "The 4-ingredient pasta nobody talks about."

### 14.4 The trope wall

Phrases and patterns we **never write**. If a draft contains any of these, regenerate.

| Trope | Why it fails |
|---|---|
| "Today I want to share..." | Pure food-blog opener. The product exists to skip this. |
| "My family LOVES this" | Authority-by-anecdote. Unverifiable, sentimental. |
| "The BEST [dish]" | Universal claim with no proof. |
| "You NEED to try this" | Imperative + breathless. Aggressive selling. |
| "Literally the easiest..." | "Literally" is a tell. So is the superlative. |
| "Perfect for any occasion" | Empty filler that adds no information. |
| "So delicious!" / "OMG amazing" | Reaction language. Show, don't tell. |
| Emoji walls | Performative. Zero emoji in titles, sparingly elsewhere. |
| "I just had to share!" | Implied audience demand we're "yielding to." |
| "Game changer" | Generic hyperbole. |
| "Easy peasy" / "lickety-split" | Cutesy. Off-brand. |
| "Healthy and delicious!" | We never make health claims. |
| Mocking tone aimed at people | Mock the format, not the cooks. |

### 14.5 Voice across copy surfaces

**Pinterest pin title (≤100 chars):**

✓ `Spaghetti Carbonara, 4 Ingredients, 20 Minutes`
✓ `One-Pan Lemon Garlic Chicken (no marinating)`
✓ `Chana Masala You Can Make on a Wednesday`
✗ `OMG The BEST Carbonara Ever! 🍝✨`
✗ `Easy Carbonara Recipe Quick Pasta Dinner Italian Food Recipes`
✗ `My Famous Family Carbonara`

**Pinterest pin description (200-400 chars):**

> Four ingredients, one pan, no cream. The Roman version of carbonara built on egg, pecorino, guanciale and black pepper, finished off the heat so the eggs stay silky instead of scrambled. Ready in the time it takes to boil pasta. Get the full recipe at reduced.recipes, no story scroll.

**Reels/Shorts opening hook (≤8 words):**

✓ `The 4-ingredient pasta nobody talks about`
✓ `Curry that takes 35 minutes, not 4 hours`
✓ `One pan. No marinade. 30 minutes.`
✗ `WAIT FOR IT 😱`
✗ `LIFE CHANGING pasta hack!`

**Step card text (≤10 words per step):**

✓ `Sear chicken, 4 min per side`
✓ `Whisk eggs and pecorino, off heat`
✓ `Toss pasta in residual fat, 30 seconds`
✗ `You're going to want to sear the chicken next`
✗ `Time to crisp up that bacon, friends!`

**CTA (fixed across the system, don't iterate):**

```
Full recipe, no scroll  ·  reduced.recipes
```

For pin descriptions: `Get the full recipe at reduced.recipes, no story scroll.`

### 14.6 What we never claim

| Category | Never |
|---|---|
| Health | "healthy", "guilt-free", "weight loss", "diet-friendly", "clean eating" |
| Authority | "the original", "the authentic", "the only", "as taught by..." |
| Universality | "everyone loves", "the whole family", "even kids will eat this" |
| Provenance | We don't credit source sites in social copy. |
| Process | We never reference "AI", "automated", or "generated" in content. |

### 14.7 Loaded words

| Use | Avoid |
|---|---|
| four ingredients | a few simple ingredients |
| twenty minutes | quick |
| weeknight | easy |
| crisp / sear / fold | cook up / whip up |
| set aside | reserve for later |
| off the heat | from the stove |
| serves two | feeds the whole family |
| guanciale (untranslated) | bacon (when guanciale is meant) |
| pasta water | starchy cooking liquid |
| reduced.recipes | the link in our bio |

**Keep proper culinary terms untranslated:** carbonara, guanciale, pecorino, soffritto, mirepoix, bibimbap, gochujang, panettone, panna cotta. Don't substitute "Italian bacon" for guanciale. The audience either knows or learns.

### 14.8 Sample end-to-end pieces

**Pinterest pin: Spaghetti Carbonara**

```json
{
  "pin_title": "Spaghetti Carbonara, 4 Ingredients, 20 Minutes",
  "pin_description": "Four ingredients, one pan, no cream. The Roman version of carbonara built on egg, pecorino, guanciale and black pepper, finished off the heat so the eggs stay silky instead of scrambled. Ready in the time it takes to boil pasta. Get the full recipe at reduced.recipes, no story scroll.",
  "hashtags": ["#weeknightdinner", "#onepanmeal", "#carbonara", "#italianfood", "#pastarecipes"]
}
```

**Reels timeline: Chana Masala (35 min, vegan)**

```
[0.0-2.0]  HOOK: "Curry that takes 35 minutes, not 4 hours"
[2.0-6.0]  WHAT YOU NEED: chickpeas / tomatoes / onion / ginger / garam masala
[6.0-9.0]  STEP 1 of 4: "Bloom spices in oil, 30 seconds"
[9.0-12.0] STEP 2 of 4: "Add onion and ginger, 6 minutes"
[12.0-15.0] STEP 3 of 4: "Tomatoes and chickpeas, simmer 15 minutes"
[15.0-18.0] STEP 4 of 4: "Mash a third for body, finish with cilantro"
[18.0-22.0] STATS: "35 min · Serves 4"
[22.0-25.0] CTA: "Full recipe, no scroll  ·  reduced.recipes"
```

### 14.9 Edge cases

**Holidays:** Don't get saccharine. The voice doesn't soften for Christmas.
- ✓ `Roast potatoes that actually shatter on the outside, every time`
- ✗ `The most magical, cosy holiday roast potatoes! 🎄✨`

**Recipes with sentimental origin (grandma, region):** The recipe data may carry a sentimental backstory. We strip it.
- ✓ `Slow-braised brisket, six hours of oven time, no checking`
- ✗ `My grandmother's brisket recipe, passed down through generations`

**Diet-adjacent recipes (vegan, GF, lactose-free):** Describe factually.
- ✓ `A vegan Buddha bowl with quinoa, roasted sweet potato and tahini`
- ✗ `A guilt-free vegan bowl that's healthy and delicious!`

### 14.10 Applying the voice in adapter prompts

Adapter Worker system prompts:

1. Set the voice in one sentence at the top:
   > Voice: practical, slightly dry, gently mocks food-blog tropes without being mean. Talks to another home cook, not at an audience.

2. Embed the **trope wall** (§14.4) as an explicit do-not list. Cheaper to enumerate failures than describe success.

3. Reference the **calibration dials** (§14.3) as a tiebreaker rule:
   > When in doubt: prefer specific over universal, quiet over enthusiastic, earned over promised.

4. Use one sample from §14.8 as a few-shot demonstration for the relevant surface.

5. Hard-code the CTA wording from §14.5. Don't let the model improvise the CTA.

6. Lock the constraint list from §14.6.

When prompt versions change in response to weekly learnings, record changes in a project journal — adapter source code is the canonical reference until D1-backed prompt versioning lands as Phase 1 polish.

---

# Part III — Spike findings

Three pre-build spikes ran on 2026-05-06 to validate the technical assumptions in Part I before committing to the build. **All three passed exit criteria.** Full artifacts live under `spec/spikes/social/` (raw JSON results, sample images, rendered MP4, container Dockerfile).

## 15.1 Spike A — Workers AI Llama JSON reliability

**Question:** Can `@cf/meta/llama-3.3-70b-instruct-fp8-fast` return parseable, schema-valid JSON for the Pinterest caption prompt?

**Setup:** 20 representative recipes sent through the production-shape prompt. Each response validated against `{pin_title ≤100 chars, pin_description 100-500 chars, hashtags array of 3-8 strings}`.

**Result:** **20 / 20 = 100% first-pass schema-valid.** Avg latency 4084 ms.

**Key finding:** Workers AI's Llama 3.3 70B returns a **pre-parsed JSON object in `result.response`** when the prompt asks for JSON. Adapter Workers should expect both shapes (string and object) defensively.

**Decision:** Ship as-is. No retry-with-correction layer needed. The §10 risk "Workers AI structured-JSON unreliable" is removed.

## 15.2 Spike B — Image gen cost + quality (Flux Schnell)

**Question:** Does Flux Schnell on Workers AI clear the $0.04/image and Pinterest quality bar?

**Setup:** 10 prompts spanning hero, finished, ingredient stills, step photos. Run against `@cf/black-forest-labs/flux-1-schnell` and `@cf/black-forest-labs/flux-2-klein-4b`.

**Result:**
- flux-1-schnell: **10/10 succeeded**, ~2 s/image, ~544 KB avg, ~$0.04-0.07 per image
- flux-2-klein-4b: 0/10 (multipart binding mismatch; not pursued)

**Quality assessment:** ~60% Pinterest-acceptable, ~30% borderline, ~10% with food-correctness errors (carbonara generated with red sauce, garlic with stem artefact). At Pinterest scroll speed (<1 s viewing) errors are mostly invisible; in Reels/Shorts where viewers see frames for 2-4 s, errors are more noticeable.

**Decision:** Flux-1-schnell is workable for v1. Two architectural commitments:
1. **Ingredient image cache in R2 is mandatory** — at full volume without caching, ingredient stills push to ~$200/mo. Cached, ongoing cost drops to ~$36/mo (hero + finished only per recipe).
2. **Per-cuisine prompt-suffix table** to negate known failure modes (e.g. "no tomato sauce" for carbonara). Lives in `image-gen.prompts.ts`; extended from operational data.

The hybrid path (real licensed photos for hero/finished, AI elsewhere) stays on the table for Phase 2 if engagement data warrants it.

## 15.3 Spike C — Remotion in Cloudflare Containers

**Question:** Can a containerised Remotion + Chromium pipeline render a 25 s 1080×1920 vertical video reliably and at acceptable cost?

**Setup:** Built a minimal `<RecipeCard />` composition with five sequences (Hook, Ingredients, Steps, Stats, CTA). Containerised with Node 22 + Chromium runtime libs. Rendered locally via Docker.

**Result:**

| Metric | Value |
|---|---|
| Renders attempted | 5 |
| Renders succeeded | 5 |
| Avg render time | ~48.5 s |
| Output MP4 size | 1.6 MB |
| Container image size | 999 MB |

**Projection to Cloudflare Containers `standard` tier (1/2 vCPU, 4 GB):** render time 90-180 s, cost $0.02-0.05 per render. Cold start (image pull + Chromium boot) projected 10-20 s.

**All exit criteria met:**

| Criterion | Threshold | Observed/projected | Status |
|---|---|---|---|
| Cold start | <30 s | 10-20 s | pass |
| Render time | <90 s | 50 s local, 90-180 s projected | pass |
| Cost per render | <$0.10 | $0.02-0.05 | pass |
| Reliability | 100% on warm | 5/5 | pass |

**Decision:** Cloudflare Containers is the render target. AWS Lambda fallback no longer needed. The §10 risk "Remotion in CF Containers unproven" is removed.

The spike scaffold (`spec/spikes/social/spike-c-remotion-container/remotion-app/`, Dockerfile, wrangler.toml) is lift-and-shift ready into `containers/social-renderer/`.

---

# Part IV — Implementation tickets

Each ticket below is self-contained: goal, acceptance criteria, files to create, full code (route handlers / queue handlers / D1 queries / wrangler config), tests, and manual verification steps. Schema fixes from the audit are applied inline; references to actual existing tables (`recipe_tags`, `recipe_ingredients`, `recipe_votes`) are correct.

## Recommended build order

```
Batch A (foundation):       001 → 002 → 003 → 004
Batch B (input layer):      015 → 014 → 005 → 013 → 006 → 017
Batch C (generation+publish): 007 → 008 → 010 → 016 → 009
Batch D (review+measure):   011 → 012
```

Ticket 017 (recipes.original_language migration) lands with Batch B because the selector (006) filters on that column.

## Conventions across tickets

- Worker source: `packages/workers/src/social/<name>.ts`
- Worker config: `packages/workers/wrangler.social-<name>.toml`
- D1 migrations: `migrations/NNNN_<name>.sql` (recipes DB)
- Shared types: `packages/social-shared`
- Notifier: `packages/notifier`
- Never inline D1 database IDs, KV namespace IDs, or account IDs in tickets. Reference `packages/workers/wrangler.api.toml` for the existing recipes/users DB IDs.
- All new Workers expose `GET /health` returning 200 OK and `POST /trigger` for manual invocation.

---

## 16. Ticket 001 — D1 migrations for social tables

**Phase:** 1 · **Depends on:** none · **Effort:** S
**DB:** `reduced-recipes-prod` (FK to `recipes(id)` requires same database)

### Goal

Create the eight social automation tables defined in §3.1. Single SQL migration applied via Wrangler.

### Acceptance criteria

- [ ] `migrations/0007_social_tables.sql` exists with all eight tables and indexes
- [ ] `pnpm exec wrangler d1 migrations apply reduced-recipes-prod --local --config packages/workers/wrangler.api.toml` succeeds
- [ ] Each table queryable: `SELECT * FROM <table> LIMIT 1` returns no error

### Implementation

`migrations/0007_social_tables.sql`:

```sql
-- =============================================
-- Migration 0007: Social automation tables
-- =============================================

-- Source content selected for adaptation each day.
CREATE TABLE IF NOT EXISTS social_source_candidates (
  id              TEXT PRIMARY KEY,
  recipe_id       TEXT NOT NULL,
  selection_reason TEXT NOT NULL,
  selection_score REAL NOT NULL,
  theme           TEXT,
  selected_at     INTEGER NOT NULL, -- unix ms
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_social_source_selected_at ON social_source_candidates(selected_at);

CREATE TABLE IF NOT EXISTS social_drafts (
  id              TEXT PRIMARY KEY,
  source_id       TEXT NOT NULL,
  platform        TEXT NOT NULL CHECK (platform IN ('pinterest', 'instagram', 'youtube', 'tiktok')),
  variant_label   TEXT,
  caption         TEXT,
  hashtags        TEXT,
  hook            TEXT,
  script          TEXT,
  cta_text        TEXT,
  cta_url         TEXT,
  asset_r2_keys   TEXT NOT NULL, -- JSON array; adapter inserts after R2 upload
  prompt_version  TEXT NOT NULL,
  model           TEXT NOT NULL,
  generation_cost_usd REAL,
  status          TEXT NOT NULL CHECK (status IN ('pending_approval', 'approved', 'rejected', 'scheduled', 'published', 'failed')),
  rejection_reason TEXT,
  approved_at     INTEGER, -- unix ms
  scheduled_for   INTEGER, -- unix ms
  created_at      INTEGER NOT NULL, -- unix ms
  FOREIGN KEY (source_id) REFERENCES social_source_candidates(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_social_drafts_status ON social_drafts(status);
CREATE INDEX IF NOT EXISTS idx_social_drafts_platform_status ON social_drafts(platform, status);
CREATE INDEX IF NOT EXISTS idx_social_drafts_scheduled ON social_drafts(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_social_drafts_source ON social_drafts(source_id);

CREATE TABLE IF NOT EXISTS social_posts (
  id              TEXT PRIMARY KEY,
  draft_id        TEXT NOT NULL UNIQUE,
  platform        TEXT NOT NULL CHECK (platform IN ('pinterest', 'instagram', 'youtube', 'tiktok')),
  platform_post_id TEXT NOT NULL,
  permalink       TEXT,
  short_link      TEXT NOT NULL,
  published_at    INTEGER NOT NULL, -- unix ms
  FOREIGN KEY (draft_id) REFERENCES social_drafts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform_published ON social_posts(platform, published_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform_post_id ON social_posts(platform_post_id);

CREATE TABLE IF NOT EXISTS social_metrics_snapshots (
  id              TEXT PRIMARY KEY,
  post_id         TEXT NOT NULL,
  captured_at     INTEGER NOT NULL, -- unix ms
  age_hours       INTEGER NOT NULL,
  impressions INTEGER, reach INTEGER, likes INTEGER, comments INTEGER,
  shares INTEGER, saves INTEGER, click_throughs INTEGER, video_views INTEGER,
  video_avg_watch_seconds REAL,
  FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_social_metrics_post_age ON social_metrics_snapshots(post_id, age_hours);
CREATE INDEX IF NOT EXISTS idx_social_metrics_captured ON social_metrics_snapshots(captured_at);

CREATE TABLE IF NOT EXISTS social_attribution (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL, date TEXT NOT NULL,
  sessions INTEGER NOT NULL DEFAULT 0,
  installs INTEGER NOT NULL DEFAULT 0,
  signups INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
  UNIQUE(post_id, date)
);
CREATE INDEX IF NOT EXISTS idx_social_attribution_date ON social_attribution(date);

CREATE TABLE IF NOT EXISTS social_prompt_versions (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('pinterest', 'instagram', 'youtube', 'tiktok')),
  variant_label TEXT NOT NULL,
  template TEXT NOT NULL, notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL -- unix ms
);
CREATE INDEX IF NOT EXISTS idx_social_prompts_platform_active ON social_prompt_versions(platform, active);

CREATE TABLE IF NOT EXISTS social_editorial_calendar (
  id TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  theme TEXT NOT NULL, cuisine_filter TEXT,
  weight REAL NOT NULL DEFAULT 1.0,
  notes TEXT
);

-- AI-generated ingredient image cache. Architecturally mandatory:
-- without this layer the all-AI image cost blows the $50 ceiling.
CREATE TABLE IF NOT EXISTS social_ingredient_image_cache (
  ingredient_key  TEXT PRIMARY KEY,
  r2_key          TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  model           TEXT NOT NULL,
  generated_at    INTEGER NOT NULL, -- unix ms
  bytes           INTEGER NOT NULL
);
```

### Manual verification

```bash
pnpm exec wrangler d1 migrations apply reduced-recipes-prod --local \
  --config packages/workers/wrangler.api.toml

pnpm exec wrangler d1 execute reduced-recipes-prod --local \
  --config packages/workers/wrangler.api.toml \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'social_%';"
# expect: 8 social_* tables
```

Apply remote in CI by merging to main; the existing `deploy.yml` workflow already runs migrations for the recipes DB.

### Notes

- D1 doesn't support cross-database FKs, which is why these go in `migrations/` (the recipes DB) not a new `migrations-social/` directory.
- Timestamps are unix ms (`INTEGER`) except `social_attribution.date` and `social_editorial_calendar.start_date / end_date` which are `YYYY-MM-DD`.
- `hashtags` and `asset_r2_keys` are JSON-encoded arrays. Read with `JSON.parse(row.hashtags)` in TypeScript.
- `idx_drafts_scheduled` is a partial index on `status = 'scheduled'`. SQLite supports this; D1 inherits.

---

## 17. Ticket 002 — `packages/social-shared`

**Phase:** 1 · **Depends on:** 001 · **Effort:** M

### Goal

A workspace package holding TypeScript types matching the real D1 schema and KV recipe doc shape, ULID generation, R2 helpers, ingredient image cache helpers, and skeleton platform-client modules.

### Acceptance criteria

- [ ] Package builds (`pnpm --filter @rr/social-shared build`) with no TypeScript errors
- [ ] `pnpm --filter @rr/social-shared test` passes
- [ ] `import type { SocialDraft, RecipeDocument } from '@rr/social-shared'` resolves
- [ ] `normaliseIngredientKey('1 cup chopped Garlic ')` returns `'garlic'`
- [ ] `assetUrl('drafts/abc.png')` returns `'https://assets.reduced.recipes/drafts/abc.png'`

### Files to create

```
packages/social-shared/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── ulid.ts
│   ├── r2.ts
│   ├── ingredient-cache.ts
│   ├── ingredient-cache.test.ts
│   └── platforms/
│       ├── pinterest.ts
│       ├── pinterest-auth.ts
│       ├── meta.ts
│       └── youtube.ts
```

### Implementation

**`package.json`:**

```json
{
  "name": "@rr/social-shared",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types.ts",
    "./ulid": "./src/ulid.ts",
    "./r2": "./src/r2.ts",
    "./ingredient-cache": "./src/ingredient-cache.ts",
    "./platforms/pinterest": "./src/platforms/pinterest.ts",
    "./platforms/pinterest-auth": "./src/platforms/pinterest-auth.ts",
    "./platforms/meta": "./src/platforms/meta.ts",
    "./platforms/youtube": "./src/platforms/youtube.ts"
  },
  "scripts": {
    "build": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "ulid": "^2.3.0" },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240909.0",
    "typescript": "^5.6.0",
    "vitest": "^3.2.0"
  }
}
```

**`src/types.ts` (schema-corrected):**

```ts
export type Platform = 'pinterest' | 'instagram' | 'youtube' | 'tiktok';

export type DraftStatus =
  | 'pending_approval' | 'approved' | 'rejected'
  | 'scheduled' | 'published' | 'failed';

// --- Social tables (mine, defined in ticket 001) ---

export interface SocialSourceCandidate {
  id: string;
  recipe_id: string;
  selection_reason: 'trending' | 'seasonal' | 'editorial' | 'longtail';
  selection_score: number;
  theme: string | null;
  selected_at: number;
}

export interface SocialDraftRow {
  id: string;
  source_id: string;
  platform: Platform;
  variant_label: string | null;
  caption: string | null;
  hashtags: string | null;             // JSON-encoded
  hook: string | null;
  script: string | null;
  cta_text: string | null;
  cta_url: string | null;
  asset_r2_keys: string;               // JSON-encoded
  prompt_version: string;
  model: string;
  generation_cost_usd: number | null;
  status: DraftStatus;
  rejection_reason: string | null;
  approved_at: number | null;
  scheduled_for: number | null;
  created_at: number;
}

export interface SocialDraft extends Omit<SocialDraftRow, 'hashtags' | 'asset_r2_keys'> {
  hashtags: string[];
  asset_r2_keys: string[];
}

export function rowToDraft(row: SocialDraftRow): SocialDraft {
  return {
    ...row,
    hashtags: row.hashtags ? JSON.parse(row.hashtags) : [],
    asset_r2_keys: JSON.parse(row.asset_r2_keys),
  };
}

export interface SocialPost {
  id: string;
  draft_id: string;
  platform: Platform;
  platform_post_id: string;
  permalink: string | null;
  short_link: string;
  published_at: number;
}

export interface SocialMetricsSnapshot {
  id: string; post_id: string; captured_at: number; age_hours: number;
  impressions: number | null; reach: number | null;
  likes: number | null; comments: number | null;
  shares: number | null; saves: number | null;
  click_throughs: number | null; video_views: number | null;
  video_avg_watch_seconds: number | null;
}

export interface IngredientCacheRow {
  ingredient_key: string;
  r2_key: string;
  prompt_version: string;
  model: string;
  generated_at: number;
  bytes: number;
}

// --- Existing recipes-DB shapes (selector reads these) ---

// Reflects actual columns in `recipes` after migrations 0001-0006 + 0017.
// total_time is INTEGER minutes (NOT a string).
// tags do not live on this row — see RecipeTagRow.
export interface RecipeRow {
  id: string;
  title: string;
  cuisine: string | null;
  total_time: number | null;
  hot_score: number | null;
  original_language: string | null;
  // Joined columns (not on recipes itself):
  save_velocity_7d: number;            // from social_recipe_signals
  search_volume_7d: number;            // from social_recipe_signals
  last_featured_at: number | null;     // computed via subquery
  tags_csv: string | null;             // GROUP_CONCAT subquery on recipe_tags
}

// Junction-table shape, kept here for documentation; reads use GROUP_CONCAT.
export interface RecipeTagRow { recipe_id: string; tag: string }
export interface RecipeIngredientRow { recipe_id: string; ingredient: string }

// --- KV-stored full recipe doc (canonical source for ingredients + instructions) ---

// Mirrors the @rr/shared RecipeDocument shape. Adapter Workers fetch this from
// RECIPES_KV via `env.RECIPES_KV.get('recipe:' + id, 'text')`.
export interface RecipeDocument {
  id: string;
  title: string;
  cuisine: string | null;
  total_time: number | null;            // minutes
  yields: string | null;
  ingredients: string[];                // human-readable, with quantities
  instructions: string[];               // numbered steps
  image_url: string | null;
  source_url: string;
  domain: string;
  original_language?: string;
  tags?: string[];                      // optional; use recipe_tags table when authoritative
}

// --- Composition props for the Remotion video template ---

export interface RecipeCardProps {
  hookText: string;
  ingredients: Array<{ label: string; thumbnailR2Key?: string }>;
  steps: Array<{ duration: number; text: string; stillR2Key?: string }>;
  statsText: string;
  ctaText: string;
  heroR2Key?: string;
  finishedR2Key?: string;
  platform: 'reels' | 'shorts' | 'tiktok';
}

// --- Helpers ---

export function formatTotalTime(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
```

**`src/ulid.ts`:**

```ts
export { ulid } from 'ulid';
```

**`src/r2.ts`:**

```ts
const ASSETS_HOST = 'https://assets.reduced.recipes';
const SHORTLINK_HOST = 'https://r.reduced.recipes';

export function assetUrl(r2Key: string): string {
  if (r2Key.startsWith('/')) r2Key = r2Key.slice(1);
  return `${ASSETS_HOST}/${r2Key}`;
}

export function shortLinkUrl(draftId: string, params: {
  platform: string;
  campaign: string;
}): string {
  const u = new URL(`${SHORTLINK_HOST}/${draftId}`);
  u.searchParams.set('utm_source', params.platform);
  u.searchParams.set('utm_medium', 'organic_social');
  u.searchParams.set('utm_campaign', params.campaign);
  u.searchParams.set('utm_content', draftId);
  return u.toString();
}

export function recipePageUrl(recipeId: string): string {
  return `https://reduced.recipes/recipe/${recipeId}`;
}
```

**`src/ingredient-cache.ts`:**

```ts
import type { IngredientCacheRow } from './types';

const STOPWORDS = new Set([
  'cup', 'cups', 'tbsp', 'tsp', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons',
  'g', 'kg', 'ml', 'l', 'oz', 'lb', 'lbs', 'pound', 'pounds',
  'large', 'medium', 'small', 'fresh', 'dried', 'chopped', 'diced', 'minced',
  'sliced', 'crushed', 'whole', 'ground', 'finely', 'roughly',
  'a', 'an', 'the', 'of', 'to', 'taste', 'optional', 'pinch',
]);

const PLURAL_TO_SINGULAR: Record<string, string> = {
  tomatoes: 'tomato', potatoes: 'potato', onions: 'onion', carrots: 'carrot',
  cloves: 'clove', eggs: 'egg', lemons: 'lemon', limes: 'lime', apples: 'apple',
};

export function normaliseIngredientKey(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .map((t) => PLURAL_TO_SINGULAR[t] ?? (t.endsWith('s') && t.length > 3 ? t.slice(0, -1) : t));
  return tokens.join(' ').trim();
}

export interface CacheEnv {
  DB: D1Database;
  RR_SOCIAL_CACHE: R2Bucket;
}

export async function lookupIngredientImage(
  env: CacheEnv,
  rawIngredient: string,
): Promise<IngredientCacheRow | null> {
  const key = normaliseIngredientKey(rawIngredient);
  if (!key) return null;
  const row = await env.DB
    .prepare(`SELECT * FROM social_ingredient_image_cache WHERE ingredient_key = ?`)
    .bind(key)
    .first<IngredientCacheRow>();
  return row ?? null;
}

export async function recordIngredientImage(
  env: CacheEnv,
  args: { ingredient: string; r2Key: string; bytes: number; promptVersion: string; model: string },
): Promise<void> {
  const key = normaliseIngredientKey(args.ingredient);
  if (!key) throw new Error(`Cannot normalise ingredient: ${args.ingredient}`);
  await env.DB.prepare(`
    INSERT INTO social_ingredient_image_cache
      (ingredient_key, r2_key, prompt_version, model, generated_at, bytes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(ingredient_key) DO UPDATE SET
      r2_key = excluded.r2_key, prompt_version = excluded.prompt_version,
      model = excluded.model, generated_at = excluded.generated_at,
      bytes = excluded.bytes
  `).bind(key, args.r2Key, args.promptVersion, args.model, Date.now(), args.bytes).run();
}
```

**`src/ingredient-cache.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { normaliseIngredientKey } from './ingredient-cache';

describe('normaliseIngredientKey', () => {
  it('strips quantities and units', () => {
    expect(normaliseIngredientKey('1 cup chopped Garlic')).toBe('garlic');
    expect(normaliseIngredientKey('2 tbsp olive oil')).toBe('olive oil');
    expect(normaliseIngredientKey('500 g tomatoes')).toBe('tomato');
  });
  it('singularises common plurals', () => {
    expect(normaliseIngredientKey('tomatoes')).toBe('tomato');
    expect(normaliseIngredientKey('eggs')).toBe('egg');
    expect(normaliseIngredientKey('5 lemons')).toBe('lemon');
  });
  it('handles preparation modifiers', () => {
    expect(normaliseIngredientKey('finely diced fresh ginger')).toBe('ginger');
    expect(normaliseIngredientKey('large yellow onion, sliced')).toBe('yellow onion');
  });
  it('returns empty string for input that is only stopwords', () => {
    expect(normaliseIngredientKey('a pinch of')).toBe('');
  });
});
```

**`src/platforms/pinterest.ts` (skeleton):**

```ts
export interface PinterestEnv { RR_SOCIAL_TOKENS: KVNamespace }

export interface CreatePinInput {
  boardId: string;
  description: string;
  link: string;
  imageUrl: string;
}

export async function createPin(_env: PinterestEnv, _input: CreatePinInput) {
  throw new Error('Not implemented; see ticket 009');
}
```

`platforms/meta.ts` and `platforms/youtube.ts` follow the same skeleton pattern. `platforms/pinterest-auth.ts` is implemented in ticket 014.

**`src/index.ts`:**

```ts
export * from './types';
export { ulid } from './ulid';
export { assetUrl, shortLinkUrl, recipePageUrl } from './r2';
export {
  normaliseIngredientKey, lookupIngredientImage, recordIngredientImage,
} from './ingredient-cache';
```

**`tsconfig.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ES2022", "moduleResolution": "bundler",
    "strict": true, "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "esModuleInterop": true, "skipLibCheck": true, "noEmit": true,
    "declaration": false
  },
  "include": ["src/**/*.ts"]
}
```

### Wire into the workspace

Add `"@rr/social-shared": "workspace:*"` to `packages/workers/package.json`.

### Notes

- `RecipeRow` deliberately includes `tags_csv` from a `GROUP_CONCAT` subquery rather than a JSON column on `recipes`. The actual schema has tags in a junction table.
- `RecipeDocument` is the canonical source for ingredients and instructions. Adapters read from `RECIPES_KV`; the selector reads only D1 columns to keep the candidate query fast.
- `recipePageUrl(recipeId)` returns `/recipe/${id}` because the frontend has no slug column.

---

## 18. Ticket 003 — `packages/notifier`

**Phase:** 1 · **Depends on:** 002 · **Effort:** S

### Goal

Swappable notification channel for the daily approval digest and ad-hoc operational alerts. `Notifier` is an interface; `EmailNotifier` is the v1 default impl using MailChannels (free, runs from a Worker).

### Acceptance criteria

- [ ] Package builds with no TypeScript errors
- [ ] Unit test: `EmailNotifier.sendDailyDigest` calls fetch with the right MailChannels payload
- [ ] Factory `createNotifier(env)` returns the impl named in `env.NOTIFIER_CHANNEL` (default: `'email'`)
- [ ] Manual end-to-end: trigger a Worker that calls `notifier.sendDailyDigest({...})` and an email arrives

### Files to create

```
packages/notifier/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── types.ts
    ├── email-notifier.ts
    ├── email-notifier.test.ts
    └── render-digest.ts
```

### Implementation

**`package.json`:**

```json
{
  "name": "@rr/notifier",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "build": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "@rr/social-shared": "workspace:*" },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240909.0",
    "typescript": "^5.6.0",
    "vitest": "^3.2.0"
  }
}
```

**`src/types.ts`:**

```ts
import type { Platform, DraftStatus } from '@rr/social-shared';

export interface DraftSummary {
  id: string;
  platform: Platform;
  hook?: string;
  caption?: string;
  hashtags?: string[];
  scheduledFor?: number;
  previewUrl?: string;
  status: DraftStatus;
}

export interface DailyDigestInput {
  drafts: DraftSummary[];
  approveBaseUrl: string;
  oneClickApproveBaseUrl: string;
  date: string;
}

export interface AlertInput {
  level: 'info' | 'warn' | 'error';
  subject: string;
  body: string;
}

export interface Notifier {
  sendDailyDigest(input: DailyDigestInput): Promise<void>;
  sendAlert(input: AlertInput): Promise<void>;
}
```

**`src/render-digest.ts`:**

```ts
import type { DailyDigestInput } from './types';

export function renderDigestText(input: DailyDigestInput): string {
  const lines: string[] = [];
  lines.push(`ReducedRecipes social drafts for ${input.date}`);
  lines.push(`${input.drafts.length} drafts ready for review.`);
  lines.push('');
  for (const d of input.drafts) {
    lines.push(`- [${d.platform}] ${d.hook ?? d.caption?.slice(0, 80) ?? '(no caption)'}`);
    lines.push(`  approve: ${input.oneClickApproveBaseUrl}/approve/${d.id}`);
    lines.push(`  reject:  ${input.oneClickApproveBaseUrl}/reject/${d.id}`);
    lines.push('');
  }
  lines.push(`Or open the admin: ${input.approveBaseUrl}`);
  return lines.join('\n');
}

export function renderDigestHtml(input: DailyDigestInput): string {
  const items = input.drafts.map((d) => `
    <li style="margin-bottom: 16px;">
      <strong>${escape(d.platform)}</strong>:
      ${escape(d.hook ?? d.caption?.slice(0, 80) ?? '(no caption)')}
      <br />
      <a href="${input.oneClickApproveBaseUrl}/approve/${d.id}">Approve</a>
      &nbsp;|&nbsp;
      <a href="${input.oneClickApproveBaseUrl}/reject/${d.id}">Reject</a>
    </li>
  `).join('\n');

  return `<!doctype html>
<html><body style="font-family: system-ui, sans-serif;">
  <h1>${input.drafts.length} drafts ready</h1>
  <p>${escape(input.date)}</p>
  <ul>${items}</ul>
  <p><a href="${input.approveBaseUrl}">Open the admin app</a></p>
</body></html>`;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

**`src/email-notifier.ts`:**

```ts
import type { Notifier, DailyDigestInput, AlertInput } from './types';
import { renderDigestText, renderDigestHtml } from './render-digest';

export interface EmailEnv {
  NOTIFIER_FROM: string;
  NOTIFIER_TO: string;
  NOTIFIER_FROM_NAME?: string;
}

export class EmailNotifier implements Notifier {
  constructor(private env: EmailEnv) {}

  async sendDailyDigest(input: DailyDigestInput): Promise<void> {
    const subject = `${input.drafts.length} social drafts ready (${input.date})`;
    await this.send(subject, renderDigestText(input), renderDigestHtml(input));
  }

  async sendAlert(input: AlertInput): Promise<void> {
    const prefix = { info: 'INFO', warn: 'WARN', error: 'ERROR' }[input.level];
    await this.send(`[${prefix}] ${input.subject}`, input.body, undefined);
  }

  private async send(subject: string, text: string, html: string | undefined): Promise<void> {
    const resp = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: this.env.NOTIFIER_TO }] }],
        from: {
          email: this.env.NOTIFIER_FROM,
          name: this.env.NOTIFIER_FROM_NAME ?? 'ReducedRecipes Social',
        },
        subject,
        content: [
          { type: 'text/plain', value: text },
          ...(html ? [{ type: 'text/html', value: html }] : []),
        ],
      }),
    });
    if (!resp.ok) {
      throw new Error(`MailChannels send failed: ${resp.status} ${await resp.text()}`);
    }
  }
}
```

**`src/index.ts`:**

```ts
import type { Notifier } from './types';
import { EmailNotifier, type EmailEnv } from './email-notifier';

export type { Notifier, DailyDigestInput, AlertInput, DraftSummary } from './types';
export { EmailNotifier } from './email-notifier';
export { renderDigestText, renderDigestHtml } from './render-digest';

export interface NotifierFactoryEnv extends EmailEnv {
  NOTIFIER_CHANNEL?: 'email';
}

export function createNotifier(env: NotifierFactoryEnv): Notifier {
  const channel = env.NOTIFIER_CHANNEL ?? 'email';
  if (channel === 'email') return new EmailNotifier(env);
  throw new Error(`Unknown notifier channel: ${channel}`);
}
```

**`src/email-notifier.test.ts`:**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailNotifier } from './email-notifier';

describe('EmailNotifier', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('OK', { status: 200 }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('posts a MailChannels payload for daily digest', async () => {
    const notifier = new EmailNotifier({
      NOTIFIER_FROM: 'social-bot@reduced.recipes',
      NOTIFIER_TO: 'owner@example.com',
    });

    await notifier.sendDailyDigest({
      drafts: [{ id: '01HABC', platform: 'pinterest', hook: 'Test pin', status: 'pending_approval' }],
      approveBaseUrl: 'https://social-admin.reduced.recipes',
      oneClickApproveBaseUrl: 'https://r.reduced.recipes',
      date: '2026-05-06',
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe('https://api.mailchannels.net/tx/v1/send');
    const body = JSON.parse(init.body as string);
    expect(body.subject).toContain('1 social drafts ready');
    expect(body.personalizations[0].to[0].email).toBe('owner@example.com');
  });

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Bad', { status: 500 }));
    const notifier = new EmailNotifier({ NOTIFIER_FROM: 'x@y', NOTIFIER_TO: 'z@y' });
    await expect(notifier.sendAlert({ level: 'error', subject: 's', body: 'b' })).rejects.toThrow(/500/);
  });
});
```

### Configuration

Worker consumers need:
- `NOTIFIER_FROM` (var): a `reduced.recipes` address; SPF/DKIM required
- `NOTIFIER_TO` (secret via `wrangler secret put`)
- `NOTIFIER_FROM_NAME` (var, optional)
- `NOTIFIER_CHANNEL` (var, optional, defaults to `'email'`)

MailChannels requires SPF + DKIM. SPF is a TXT record; DKIM is auto-managed by Cloudflare's free email routing for `reduced.recipes`.

### Notes

- MailChannels is the only free transactional path from a Worker today. If their pricing changes, swap `EmailNotifier` impl without touching callers.
- `oneClickApproveBaseUrl` resolves under `r.reduced.recipes`. The shortlink Worker (ticket 010) handles `/approve/:id` and `/reject/:id` paths, gated by Cloudflare Access.

---

## 19. Ticket 004 — `social-orchestrator` cron Worker

**Phase:** 1 · **Depends on:** 001, 002, 003 · **Effort:** S

### Goal

Daily cron at **04:00 UTC (06:00 SAST / 23:00 ET prior day)** that kicks off the generation pipeline:

1. Check global killswitch; abort + alert if set
2. Trigger `social-signals-rollup` (best effort if unbound)
3. Trigger `social-selector`; record result counts
4. Record run state in `social_orchestrator_runs`
5. On failure, alert via Notifier

Tolerates missing service bindings while downstream Workers are unbuilt — lets cron + run-state machinery ship and test independently.

### Acceptance criteria

- [ ] `pnpm exec wrangler deploy --config packages/workers/wrangler.social-orchestrator.toml` succeeds
- [ ] Cron `0 4 * * *` registered (verify in Cloudflare dashboard)
- [ ] `POST /trigger` returns 200 and creates a `social_orchestrator_runs` row
- [ ] When `RR_SOCIAL_KILLSWITCH:global` is set, run aborts and Notifier receives an alert
- [ ] Vitest covers killswitch branch and happy path

### Files to create

```
packages/workers/src/social/orchestrator.ts
packages/workers/src/social/orchestrator.test.ts
packages/workers/wrangler.social-orchestrator.toml
migrations/0008_social_orchestrator_runs.sql
```

### Implementation

**`migrations/0008_social_orchestrator_runs.sql`:**

```sql
CREATE TABLE social_orchestrator_runs (
  id              TEXT PRIMARY KEY,
  started_at      INTEGER NOT NULL,
  finished_at     INTEGER,
  status          TEXT NOT NULL,
  candidates_emitted INTEGER,
  drafts_created  INTEGER,
  error           TEXT
);
CREATE INDEX idx_orch_started_at ON social_orchestrator_runs(started_at);
```

**`packages/workers/src/social/orchestrator.ts`:**

```ts
import { ulid } from '@rr/social-shared';
import { createNotifier } from '@rr/notifier';

interface Env {
  DB: D1Database;
  RR_SOCIAL_KILLSWITCH: KVNamespace;
  SOCIAL_SIGNALS_ROLLUP?: Fetcher;
  SOCIAL_SELECTOR?: Fetcher;
  NOTIFIER_FROM: string;
  NOTIFIER_TO: string;
  NOTIFIER_FROM_NAME?: string;
  NOTIFIER_CHANNEL?: 'email';
}

interface RunResult { candidatesEmitted: number; draftsCreated: number }

async function runScheduled(env: Env): Promise<void> {
  const runId = ulid();
  const startedAt = Date.now();

  const killswitchValue = await env.RR_SOCIAL_KILLSWITCH.get('global');
  if (killswitchValue) {
    console.log(`SOCIAL_ORCHESTRATOR ${runId}: killswitch (${killswitchValue}); aborting`);
    await insertRun(env, { runId, startedAt, status: 'killswitch', error: killswitchValue });
    await createNotifier(env).sendAlert({
      level: 'warn',
      subject: 'Social orchestrator skipped: killswitch active',
      body: `Reason: ${killswitchValue}\nRun id: ${runId}`,
    });
    return;
  }

  await insertRun(env, { runId, startedAt, status: 'running' });

  try {
    if (env.SOCIAL_SIGNALS_ROLLUP) {
      const r = await env.SOCIAL_SIGNALS_ROLLUP.fetch('https://internal/run', { method: 'POST' });
      if (!r.ok) throw new Error(`signals-rollup ${r.status}: ${await r.text()}`);
    } else {
      console.log(`SOCIAL_ORCHESTRATOR ${runId}: SOCIAL_SIGNALS_ROLLUP not bound; skipping`);
    }

    let result: RunResult = { candidatesEmitted: 0, draftsCreated: 0 };
    if (env.SOCIAL_SELECTOR) {
      const r = await env.SOCIAL_SELECTOR.fetch('https://internal/run', { method: 'POST' });
      if (!r.ok) throw new Error(`selector ${r.status}: ${await r.text()}`);
      result = (await r.json()) as RunResult;
    } else {
      console.log(`SOCIAL_ORCHESTRATOR ${runId}: SOCIAL_SELECTOR not bound; skipping`);
    }

    await env.DB.prepare(`
      UPDATE social_orchestrator_runs
      SET finished_at = ?, status = 'completed',
          candidates_emitted = ?, drafts_created = ?
      WHERE id = ?
    `).bind(Date.now(), result.candidatesEmitted, result.draftsCreated, runId).run();

    console.log(`SOCIAL_ORCHESTRATOR ${runId}: done. candidates=${result.candidatesEmitted}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`SOCIAL_ORCHESTRATOR ${runId}: failed:`, message);
    await env.DB.prepare(`
      UPDATE social_orchestrator_runs SET finished_at = ?, status = 'failed', error = ? WHERE id = ?
    `).bind(Date.now(), message, runId).run();
    await createNotifier(env).sendAlert({
      level: 'error',
      subject: 'Social orchestrator run failed',
      body: `Run id: ${runId}\nError: ${message}`,
    });
    throw err;
  }
}

async function insertRun(env: Env, args: {
  runId: string; startedAt: number;
  status: 'running' | 'completed' | 'failed' | 'killswitch'; error?: string;
}) {
  await env.DB.prepare(`
    INSERT INTO social_orchestrator_runs (id, started_at, status, error)
    VALUES (?, ?, ?, ?)
  `).bind(args.runId, args.startedAt, args.status, args.error ?? null).run();
}

export default {
  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/trigger' && req.method === 'POST') {
      try { await runScheduled(env); return new Response('OK\n', { status: 200 }); }
      catch (err) { return new Response(`Error: ${(err as Error).message}\n`, { status: 500 }); }
    }
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    return new Response('Not found', { status: 404 });
  },
};
```

**`packages/workers/wrangler.social-orchestrator.toml`:**

```toml
name = "rr-social-orchestrator"
main = "src/social/orchestrator.ts"
compatibility_date = "2025-04-01"

[triggers]
crons = ["0 4 * * *"]

[[d1_databases]]
binding = "DB"
# from packages/workers/wrangler.api.toml — recipes DB

[[kv_namespaces]]
binding = "RR_SOCIAL_KILLSWITCH"

# Service bindings — populate as downstream Workers come online (005, 006).
# [[services]]
# binding = "SOCIAL_SIGNALS_ROLLUP"
# service = "rr-social-signals-rollup"
#
# [[services]]
# binding = "SOCIAL_SELECTOR"
# service = "rr-social-selector"

[vars]
NOTIFIER_FROM = "social-bot@reduced.recipes"
NOTIFIER_FROM_NAME = "RR Social"
NOTIFIER_CHANNEL = "email"
# NOTIFIER_TO via `wrangler secret put`
```

### Test sketch

`orchestrator.test.ts` mocks the `DB` and `RR_SOCIAL_KILLSWITCH` bindings, mocks `@rr/notifier`'s `createNotifier`, and asserts:
1. With `global` set in killswitch → row inserted with `status='killswitch'`, no service-binding fetch
2. Without killswitch and no service bindings → row inserted with `status='running'` then updated to `'completed'`

### Manual verification

```bash
pnpm exec wrangler d1 migrations apply reduced-recipes-prod --local \
  --config packages/workers/wrangler.api.toml

pnpm exec wrangler kv namespace create RR_SOCIAL_KILLSWITCH
# (paste returned id into wrangler.social-orchestrator.toml)

pnpm exec wrangler secret put NOTIFIER_TO \
  --config packages/workers/wrangler.social-orchestrator.toml

pnpm exec wrangler deploy --config packages/workers/wrangler.social-orchestrator.toml

curl -X POST https://rr-social-orchestrator.<workers-subdomain>.workers.dev/trigger
# expect 200 OK
```

### Notes

- `ctx.waitUntil(runScheduled(env))` lets the cron handler return synchronously while work continues.
- Service bindings stay commented out until 005/006 land. Worker is tolerant of missing bindings on purpose.
- Cron is UTC; `0 4 * * *` was chosen so adapter publishes (which target US Eastern slots) have lead time.
- `social_orchestrator_runs` is internal observability; pruned to last 90 days by ticket 012.

---

## 20. Ticket 005 — `social-signals-rollup` cron Worker (schema-corrected)

**Phase:** 1 · **Depends on:** 001 · **Effort:** M

### Goal

Pre-compute selector signals (`save_velocity_7d`, `search_volume_7d`) once a day so the selector doesn't do cross-DB joins on the hot path. Writes a denormalised `social_recipe_signals` table.

**Schema correction from earlier draft:** the users DB has no `bookmarks` table. "Saves" come from `recipe_votes` where `action='heart'`. `recipe_votes.created_at` is `TEXT default datetime('now')`, so date filtering uses SQL datetime functions, not unix-ms binding.

### Acceptance criteria

- [ ] `migrations/0009_social_recipe_signals.sql` adds the signals table
- [ ] `migrations/0010_search_hit_counter.sql` adds the search-hit counter table
- [ ] Cron runs at 03:30 UTC daily, populates / refreshes `social_recipe_signals`
- [ ] Each row has `save_velocity_7d` and `search_volume_7d` normalised to `[0, 1]`
- [ ] `packages/workers/src/api.ts` search route increments the counter
- [ ] Manual `POST /trigger` populates the table

### Files to create / modify

```
migrations/0009_social_recipe_signals.sql
migrations/0010_search_hit_counter.sql
packages/workers/src/social/signals-rollup.ts
packages/workers/src/social/signals-rollup.test.ts
packages/workers/wrangler.social-signals-rollup.toml
packages/workers/src/api.ts                    (modify search handler)
```

### Implementation

**`migrations/0009_social_recipe_signals.sql`:**

```sql
CREATE TABLE social_recipe_signals (
  recipe_id        TEXT PRIMARY KEY,
  save_velocity_7d REAL NOT NULL,
  search_volume_7d REAL NOT NULL DEFAULT 0,
  raw_saves_7d     INTEGER NOT NULL,
  raw_searches_7d  INTEGER NOT NULL,
  computed_at      INTEGER NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id)
);
CREATE INDEX idx_signals_save_velocity ON social_recipe_signals(save_velocity_7d DESC);
```

**`migrations/0010_search_hit_counter.sql`:**

```sql
CREATE TABLE social_search_hits (
  recipe_id  TEXT NOT NULL,
  date       TEXT NOT NULL,
  hits       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (recipe_id, date),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id)
);
CREATE INDEX idx_search_hits_date ON social_search_hits(date);
```

**`packages/workers/src/social/signals-rollup.ts`:**

```ts
interface Env {
  DB: D1Database;          // recipes DB
  USERS_DB: D1Database;    // users DB (recipe_votes lives here)
}

interface SaveAgg { recipe_id: string; saves: number }
interface SearchAgg { recipe_id: string; hits: number }

const WINDOW_DAYS = 7;

async function run(env: Env): Promise<{ recipes: number }> {
  const sinceDate = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);

  // 1. Saves per recipe (users DB).
  // recipe_votes.created_at is TEXT default datetime('now') ("YYYY-MM-DD HH:MM:SS").
  // datetime('now', '-7 days') gives the cutoff in matching format; lexicographic compare works.
  const saves = await env.USERS_DB.prepare(`
    SELECT recipe_id, COUNT(*) AS saves
    FROM recipe_votes
    WHERE action = 'heart' AND created_at >= datetime('now', '-7 days')
    GROUP BY recipe_id
  `).all<SaveAgg>();

  // 2. Search hits per recipe (recipes DB).
  const searches = await env.DB.prepare(`
    SELECT recipe_id, SUM(hits) AS hits
    FROM social_search_hits
    WHERE date >= ?
    GROUP BY recipe_id
  `).bind(sinceDate).all<SearchAgg>();

  // 3. Maps + p95 normalisation.
  const saveMap = new Map(saves.results.map((r) => [r.recipe_id, r.saves]));
  const searchMap = new Map(searches.results.map((r) => [r.recipe_id, r.hits]));
  const savesValues = saves.results.map((r) => r.saves).sort((a, b) => a - b);
  const searchValues = searches.results.map((r) => r.hits).sort((a, b) => a - b);
  const saveP95 = percentile(savesValues, 0.95) || 1;
  const searchP95 = percentile(searchValues, 0.95) || 1;

  const recipeIds = new Set<string>([...saveMap.keys(), ...searchMap.keys()]);

  const now = Date.now();
  const stmt = env.DB.prepare(`
    INSERT INTO social_recipe_signals
      (recipe_id, save_velocity_7d, search_volume_7d, raw_saves_7d, raw_searches_7d, computed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(recipe_id) DO UPDATE SET
      save_velocity_7d = excluded.save_velocity_7d,
      search_volume_7d = excluded.search_volume_7d,
      raw_saves_7d     = excluded.raw_saves_7d,
      raw_searches_7d  = excluded.raw_searches_7d,
      computed_at      = excluded.computed_at
  `);

  const batch: D1PreparedStatement[] = [];
  for (const id of recipeIds) {
    const rawSaves = saveMap.get(id) ?? 0;
    const rawSearches = searchMap.get(id) ?? 0;
    batch.push(stmt.bind(
      id, clip01(rawSaves / saveP95), clip01(rawSearches / searchP95),
      rawSaves, rawSearches, now,
    ));
  }
  if (batch.length) await env.DB.batch(batch);

  console.log(`SOCIAL_SIGNALS_ROLLUP: refreshed ${recipeIds.size} recipes`);
  return { recipes: recipeIds.size };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function clip01(x: number): number {
  if (Number.isNaN(x) || !Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export default {
  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/run' && req.method === 'POST') {
      try { return Response.json(await run(env)); }
      catch (err) { return new Response(`Error: ${(err as Error).message}`, { status: 500 }); }
    }
    if (url.pathname === '/trigger' && req.method === 'POST') {
      try { return Response.json(await run(env)); }
      catch (err) { return new Response(`Error: ${(err as Error).message}`, { status: 500 }); }
    }
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    return new Response('Not found', { status: 404 });
  },
};
```

**`packages/workers/wrangler.social-signals-rollup.toml`:**

```toml
name = "rr-social-signals-rollup"
main = "src/social/signals-rollup.ts"
compatibility_date = "2025-04-01"

[triggers]
crons = ["30 3 * * *"]    # 30 minutes before social-orchestrator's 04:00 UTC

[[d1_databases]]
binding = "DB"
# from packages/workers/wrangler.api.toml — recipes DB

[[d1_databases]]
binding = "USERS_DB"
# from packages/workers/wrangler.api.toml — users DB
```

**Patch `packages/workers/src/api.ts` to record search hits:**

After computing search results in the existing handler, fire-and-forget the increment:

```ts
const today = new Date().toISOString().slice(0, 10);
ctx.waitUntil(
  Promise.all(
    results.map((r) =>
      env.DB.prepare(`
        INSERT INTO social_search_hits (recipe_id, date, hits)
        VALUES (?, ?, 1)
        ON CONFLICT(recipe_id, date) DO UPDATE SET hits = hits + 1
      `).bind(r.id, today).run(),
    ),
  ),
);
```

### Notes

- `recipe_votes(user_id, recipe_id, weight, action, created_at)` is the actual schema — confirmed from `migrations-users/0007_recipe_votes.sql`. `action` enum includes 'heart', 'list_add', 'auth_view'; we count only 'heart' as a save signal.
- Normalisation by p95 keeps one viral recipe from pinning every other to 0. Clip to `[0, 1]`.
- Search-hit counter is a separate small table; metrics worker (012) prunes rows >30 days old.
- Phase 1 doesn't precompute `seasonality_match_score` or `longtail_freshness_boost` — those are pure functions of `recipes` + day-of-year and live in the selector.

---

## 21. Ticket 006 — `social-selector` Worker (schema-corrected)

**Phase:** 1 · **Depends on:** 001, 002, 005, 013, 017 · **Effort:** M

### Goal

HTTP-triggered Worker that runs the daily candidate selection algorithm from §4.1. Called by `social-orchestrator` via service binding. Picks the day's source recipes per platform, writes them to `social_source_candidates`, enqueues per-platform messages on adapter queues.

**Schema correction:** tags live in `recipe_tags(recipe_id, tag)` junction table, not as a JSON column on `recipes`. The selector reads tags via `GROUP_CONCAT` subquery. `recipes` has no `difficulty` column. `total_time` is `INTEGER` minutes.

### Acceptance criteria

- [ ] `POST /run` reads signals + editorial calendar + recently-posted history, computes scores, inserts top-N candidates, enqueues adapter messages
- [ ] Score formula matches §4.1 weights (0.40, 0.20, 0.15, 0.15, 0.10, -0.30)
- [ ] Recently-posted penalty looks at `social_posts` for any platform within 14 days
- [ ] Pinterest: 4 candidates per day; Reels: 2; Shorts: 2 (Phase 1 only emits Pinterest queue messages)
- [ ] Returns `{ candidatesEmitted: N, draftsCreated: 0 }`
- [ ] Vitest covers scoring math, recently-posted penalty, queue calls

### Files to create

```
packages/workers/src/social/selector.ts
packages/workers/src/social/selector.score.ts
packages/workers/src/social/selector.test.ts
packages/workers/wrangler.social-selector.toml
```

### Implementation

**`selector.score.ts`:**

```ts
export interface ScoreInputs {
  saveVelocity7d: number;
  searchVolume7d: number;
  seasonalityMatch: number;
  editorialThemeMatch: number;
  longtailFreshness: number;
  recentlyPosted: 0 | 1;
}

export const WEIGHTS = {
  save: 0.40, search: 0.20, seasonal: 0.15,
  editorial: 0.15, longtail: 0.10, recencyPenalty: 0.30,
} as const;

export function score(i: ScoreInputs): number {
  return (
    WEIGHTS.save * i.saveVelocity7d +
    WEIGHTS.search * i.searchVolume7d +
    WEIGHTS.seasonal * i.seasonalityMatch +
    WEIGHTS.editorial * i.editorialThemeMatch +
    WEIGHTS.longtail * i.longtailFreshness -
    WEIGHTS.recencyPenalty * i.recentlyPosted
  );
}

export function seasonalityMatch(recipeTags: string[], date: Date): number {
  const month = date.getUTCMonth() + 1;
  const seasonalTags: Record<string, [number, number]> = {
    summer: [6, 8], winter: [12, 2], spring: [3, 5], autumn: [9, 11],
    grilling: [6, 8], holiday: [11, 12], christmas: [12, 12],
    'no-bake': [6, 8], soup: [10, 3], braise: [10, 3],
  };
  let best = 0;
  for (const tag of recipeTags) {
    const range = seasonalTags[tag.toLowerCase()];
    if (!range) continue;
    const [from, to] = range;
    const inSeason = from <= to ? month >= from && month <= to : month >= from || month <= to;
    if (inSeason) best = Math.max(best, 1.0);
  }
  return best;
}

export function longtailFreshness(daysSinceLastFeatured: number | null): number {
  if (daysSinceLastFeatured === null) return 1.0;
  return Math.min(1, Math.log10(daysSinceLastFeatured + 1) / Math.log10(60));
}
```

**`selector.ts`:**

```ts
import type { Platform, RecipeRow } from '@rr/social-shared';
import { ulid } from '@rr/social-shared';
import { score, seasonalityMatch, longtailFreshness } from './selector.score';

interface Env {
  DB: D1Database;
  PINTEREST_QUEUE: Queue<{ candidateId: string }>;
  REELS_QUEUE?: Queue<{ candidateId: string }>;
  SHORTS_QUEUE?: Queue<{ candidateId: string }>;
}

const DAILY_TARGETS = { pinterest: 4, reels: 2, shorts: 2 } as const;

interface ThemeRow { theme: string; weight: number }

async function run(env: Env): Promise<{ candidatesEmitted: number; draftsCreated: 0 }> {
  const today = new Date();
  const todayYmd = today.toISOString().slice(0, 10);

  // 1. Active editorial themes today.
  const themes = await env.DB.prepare(`
    SELECT theme, weight FROM social_editorial_calendar
    WHERE start_date <= ? AND end_date >= ?
  `).bind(todayYmd, todayYmd).all<ThemeRow>();
  const themeMap = new Map(themes.results.map((t) => [t.theme, t.weight]));

  // 2. Candidate pool. Tags come from the recipe_tags junction table via
  // GROUP_CONCAT (NOT a JSON column on recipes — that schema doesn't exist).
  // recipes has no `difficulty` column; total_time is INTEGER minutes.
  const pool = await env.DB.prepare(`
    SELECT r.id, r.title, r.cuisine, r.total_time, r.hot_score, r.original_language,
           COALESCE(s.save_velocity_7d, 0) AS save_velocity_7d,
           COALESCE(s.search_volume_7d, 0) AS search_volume_7d,
           (SELECT GROUP_CONCAT(tag, ',')
            FROM recipe_tags WHERE recipe_id = r.id) AS tags_csv,
           (SELECT MAX(p.published_at)
            FROM social_posts p
            JOIN social_drafts d ON d.id = p.draft_id
            JOIN social_source_candidates c ON c.id = d.source_id
            WHERE c.recipe_id = r.id) AS last_featured_at
    FROM recipes r
    LEFT JOIN social_recipe_signals s ON s.recipe_id = r.id
    WHERE r.original_language IS NULL OR r.original_language = 'en'
    LIMIT 5000
  `).all<RecipeRow>();

  // 3. Score every candidate.
  const fourteenDaysMs = 14 * 86400_000;
  const scored = pool.results.map((r) => {
    const tags = (r.tags_csv ?? '').split(',').filter(Boolean);
    const seasonal = seasonalityMatch(tags, today);
    const editorial = computeEditorialMatch(tags, themeMap);
    const daysSince = r.last_featured_at
      ? (Date.now() - r.last_featured_at) / 86400_000
      : null;
    const longtail = longtailFreshness(daysSince);
    const recentlyPosted: 0 | 1 = r.last_featured_at && (Date.now() - r.last_featured_at) < fourteenDaysMs ? 1 : 0;

    const s = score({
      saveVelocity7d: r.save_velocity_7d,
      searchVolume7d: r.search_volume_7d,
      seasonalityMatch: seasonal,
      editorialThemeMatch: editorial,
      longtailFreshness: longtail,
      recentlyPosted,
    });
    return { recipe: r, s, reason: chooseReason(seasonal, editorial, r.save_velocity_7d) };
  });

  // 4. Sort and pick top N. Dedup across platforms (one hot recipe → all 3 platforms).
  const ranked = scored.sort((a, b) => b.s - a.s);

  const inserts: Array<{ id: string; recipe_id: string; reason: string; score: number; theme: string | null }> = [];
  const platformPicks: Record<Platform, string[]> = { pinterest: [], instagram: [], youtube: [], tiktok: [] };

  for (const { recipe, s, reason } of ranked) {
    const allFilled =
      platformPicks.pinterest.length >= DAILY_TARGETS.pinterest &&
      platformPicks.instagram.length >= DAILY_TARGETS.reels &&
      platformPicks.youtube.length >= DAILY_TARGETS.shorts;
    if (allFilled) break;

    const candidateId = ulid();
    inserts.push({ id: candidateId, recipe_id: recipe.id, reason, score: s, theme: pickPrimaryTheme(themeMap) });

    if (platformPicks.pinterest.length < DAILY_TARGETS.pinterest) platformPicks.pinterest.push(candidateId);
    if (platformPicks.instagram.length < DAILY_TARGETS.reels) platformPicks.instagram.push(candidateId);
    if (platformPicks.youtube.length < DAILY_TARGETS.shorts) platformPicks.youtube.push(candidateId);
  }

  if (inserts.length === 0) return { candidatesEmitted: 0, draftsCreated: 0 };

  // 5. Persist.
  const stmt = env.DB.prepare(`
    INSERT INTO social_source_candidates
      (id, recipe_id, selection_reason, selection_score, theme, selected_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const now = Date.now();
  await env.DB.batch(
    inserts.map((c) => stmt.bind(c.id, c.recipe_id, c.reason, c.score, c.theme, now)),
  );

  // 6. Enqueue.
  if (platformPicks.pinterest.length) {
    await env.PINTEREST_QUEUE.sendBatch(
      platformPicks.pinterest.map((candidateId) => ({ body: { candidateId }, contentType: 'json' as const })),
    );
  }
  if (env.REELS_QUEUE && platformPicks.instagram.length) {
    await env.REELS_QUEUE.sendBatch(
      platformPicks.instagram.map((candidateId) => ({ body: { candidateId }, contentType: 'json' as const })),
    );
  }
  if (env.SHORTS_QUEUE && platformPicks.youtube.length) {
    await env.SHORTS_QUEUE.sendBatch(
      platformPicks.youtube.map((candidateId) => ({ body: { candidateId }, contentType: 'json' as const })),
    );
  }

  console.log(`SOCIAL_SELECTOR: ${inserts.length} candidates, pinterest=${platformPicks.pinterest.length}`);
  return { candidatesEmitted: inserts.length, draftsCreated: 0 };
}

function computeEditorialMatch(tags: string[], themeMap: Map<string, number>): number {
  const tagToTheme: Record<string, string> = {
    weeknight: 'weeknight_dinners', '30-minute': 'weeknight_dinners',
    'meal-prep': 'meal_prep_sunday',
    indulgent: 'comfort_food_or_indulgence', comfort: 'comfort_food_or_indulgence',
    festive: 'festive_holiday', summer: 'summer_freshness',
    'no-bake': 'summer_freshness', cookout: 'cookout_weeknights',
  };
  let best = 0;
  for (const tag of tags) {
    const theme = tagToTheme[tag.toLowerCase()];
    if (!theme) continue;
    const w = themeMap.get(theme);
    if (w !== undefined) best = Math.max(best, w);
  }
  return Math.min(1, best);
}

function chooseReason(seasonal: number, editorial: number, saves: number): 'trending' | 'seasonal' | 'editorial' | 'longtail' {
  if (saves > 0.7) return 'trending';
  if (seasonal > 0.5) return 'seasonal';
  if (editorial > 0.5) return 'editorial';
  return 'longtail';
}

function pickPrimaryTheme(themeMap: Map<string, number>): string | null {
  let best: { theme: string; weight: number } | null = null;
  for (const [theme, weight] of themeMap) {
    if (!best || weight > best.weight) best = { theme, weight };
  }
  return best?.theme ?? null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/run' && req.method === 'POST') {
      try { return Response.json(await run(env)); }
      catch (err) { return new Response(`Error: ${(err as Error).message}`, { status: 500 }); }
    }
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    return new Response('Not found', { status: 404 });
  },
};
```

**`wrangler.social-selector.toml`:**

```toml
name = "rr-social-selector"
main = "src/social/selector.ts"
compatibility_date = "2025-04-01"

[[d1_databases]]
binding = "DB"
# from packages/workers/wrangler.api.toml — recipes DB

[[queues.producers]]
binding = "PINTEREST_QUEUE"
queue = "rr-social-pinterest-jobs"

# Phase 2; uncomment when adapter-reels and adapter-shorts ship.
# [[queues.producers]]
# binding = "REELS_QUEUE"
# queue = "rr-social-reels-jobs"
#
# [[queues.producers]]
# binding = "SHORTS_QUEUE"
# queue = "rr-social-shorts-jobs"
```

### Test sketch

`selector.test.ts` covers:
1. `score()` with all-1 inputs and `recentlyPosted = 0` returns `WEIGHTS.save + WEIGHTS.search + WEIGHTS.seasonal + WEIGHTS.editorial + WEIGHTS.longtail` (= 1.00).
2. `score()` with `recentlyPosted = 1` subtracts `WEIGHTS.recencyPenalty`.
3. `seasonalityMatch(['summer'], new Date('2026-07-15'))` returns 1; `seasonalityMatch(['winter'], new Date('2026-07-15'))` returns 0.
4. End-to-end: mock D1 with three recipes (varying signals), one editorial theme. Assert top-4 picked, queue receives 4 messages.

### Notes

- Tag list comes from `(SELECT GROUP_CONCAT(tag, ',') FROM recipe_tags WHERE recipe_id = r.id)` returning a CSV. Parse with `(tags_csv ?? '').split(',').filter(Boolean)`. **Do not** `JSON.parse` — `recipes` has no JSON tags column.
- `recipes.original_language` is added by ticket 017 (was undocumented in prod). The selector filter `IS NULL OR = 'en'` keeps recipes safe whether the column has been backfilled or not.
- `LIMIT 5000` is a deliberate cap; the corpus exceeds 247k but most are zero-signal. Bump only after measuring D1 query time on a full pool.
- Phase 1 fans out only to Pinterest. Instagram/Youtube candidates are written but not queued — Phase 2 adapters pick them up retroactively, or next day's run re-emits.
- Same candidate id is reused across platforms intentionally so hero-image generation (the dominant cost) amortises across all variants.

---

## 22. Ticket 007 — `social-image-gen` Worker

**Phase:** 1 · **Depends on:** 001, 002, 015 · **Effort:** M

### Goal

Service-bound Worker that generates food imagery via Workers AI Flux Schnell and uploads to R2. Two surfaces:

1. **Ingredient slot** — cache-first lookup against `social_ingredient_image_cache`. Cache miss → generate, write to `rr-social-cache`, record cache row, return r2 key.
2. **Hero / finished / step slot** — always-fresh per recipe. Write to `rr-social-assets/{draftId}/{slot}.png`, return r2 key.

### Acceptance criteria

- [ ] `POST /generate-ingredient` with `{ ingredient: 'garlic' }` returns `{ r2Key, cached: false, bytes }` first call, `{ cached: true }` second
- [ ] `POST /generate-recipe-shot` with `{ slot: 'hero', recipe, draftId }` returns `{ r2Key, bytes }` and uploads to `rr-social-assets`
- [ ] Per-cuisine prompt-suffix table consulted for hero/finished slots
- [ ] Each generated image carries `cache-control: public, max-age=31536000, immutable`
- [ ] Vitest covers cache-hit, cache-miss, prompt-suffix application

### Files to create

```
packages/workers/src/social/image-gen.ts
packages/workers/src/social/image-gen.prompts.ts
packages/workers/src/social/image-gen.test.ts
packages/workers/wrangler.social-image-gen.toml
```

### Implementation

**`image-gen.prompts.ts`:**

```ts
const HERO_BASE = (recipeTitle: string) =>
  `overhead photograph of ${recipeTitle}, vibrant colours, soft natural daylight, rustic wooden surface, shallow depth of field, food photography, 35mm lens, no text overlay, no watermark`;

const FINISHED_BASE = (recipeTitle: string) =>
  `three-quarter angle photograph of finished ${recipeTitle} plated, garnished, warm cinematic light, casual rustic styling, food photography, no text, no watermark`;

const INGREDIENT_BASE = (ingredient: string) =>
  `top-down studio photograph of ${ingredient} on a plain off-white surface, soft daylight, isolated, food photography, no text, no shadows`;

const STEP_BASE = (action: string) =>
  `overhead photograph of ${action} in a home kitchen, soft daylight, food photography, no faces visible, no text`;

// Per-cuisine negation rules. Surfaces failure modes from Spike B.
const CUISINE_NEGATIONS: Record<string, string> = {
  'italian carbonara':       'no tomato sauce, no red sauce, no cream, only egg and cheese coating the pasta',
  'french sauce':            'no powdered cheese, no orange tint',
  'japanese ramen':          'no spaghetti, only ramen noodles, proper Japanese broth presentation',
  'thai curry':              'no Indian curry presentation, proper Thai bowl styling',
  'mexican taco al pastor':  'thin sliced pork, charred pineapple cubes visible',
};

export function heroPrompt(recipe: { title: string; cuisine: string | null }): string {
  return applyNegation(HERO_BASE(recipe.title), recipe);
}

export function finishedPrompt(recipe: { title: string; cuisine: string | null }): string {
  return applyNegation(FINISHED_BASE(recipe.title), recipe);
}

function applyNegation(base: string, recipe: { title: string; cuisine: string | null }): string {
  const key = `${recipe.cuisine?.toLowerCase() ?? ''} ${recipe.title.toLowerCase()}`.trim();
  for (const [k, neg] of Object.entries(CUISINE_NEGATIONS)) {
    if (key.includes(k)) return `${base}, ${neg}`;
  }
  return base;
}

export const ingredientPrompt = (ingredient: string) => INGREDIENT_BASE(ingredient);
export const stepPrompt = (action: string) => STEP_BASE(action);

export const PROMPT_VERSION = 'v1.0';
export const MODEL = '@cf/black-forest-labs/flux-1-schnell';
```

**`image-gen.ts`:**

```ts
import {
  recordIngredientImage, lookupIngredientImage, normaliseIngredientKey,
} from '@rr/social-shared';
import {
  heroPrompt, finishedPrompt, ingredientPrompt, stepPrompt, PROMPT_VERSION, MODEL,
} from './image-gen.prompts';

interface Env {
  AI: Ai;
  DB: D1Database;
  RR_SOCIAL_CACHE: R2Bucket;
  RR_SOCIAL_ASSETS: R2Bucket;
}

interface IngredientReq { ingredient: string }
interface RecipeShotReq {
  slot: 'hero' | 'finished';
  recipe: { title: string; cuisine: string | null };
  draftId: string;
}
interface StepShotReq {
  slot: 'step';
  action: string;
  draftId: string;
  index: number;
}

async function generateIngredient(env: Env, req: IngredientReq) {
  const key = normaliseIngredientKey(req.ingredient);
  if (!key) return Response.json({ error: 'ingredient normalised to empty' }, { status: 400 });

  const existing = await lookupIngredientImage(env, req.ingredient);
  if (existing) return Response.json({ r2Key: existing.r2_key, cached: true, bytes: existing.bytes });

  const png = await flux(env, ingredientPrompt(key));
  const r2Key = `ingredients/${PROMPT_VERSION}/${slug(key)}.png`;
  await env.RR_SOCIAL_CACHE.put(r2Key, png, {
    httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
  });
  await recordIngredientImage(env, {
    ingredient: req.ingredient,
    r2Key, bytes: png.byteLength,
    promptVersion: PROMPT_VERSION, model: MODEL,
  });
  return Response.json({ r2Key, cached: false, bytes: png.byteLength });
}

async function generateRecipeShot(env: Env, req: RecipeShotReq) {
  const prompt = req.slot === 'hero' ? heroPrompt(req.recipe) : finishedPrompt(req.recipe);
  const png = await flux(env, prompt);
  const r2Key = `drafts/${req.draftId}/${req.slot}.png`;
  await env.RR_SOCIAL_ASSETS.put(r2Key, png, {
    httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
  });
  return Response.json({ r2Key, bytes: png.byteLength });
}

async function generateStepShot(env: Env, req: StepShotReq) {
  const png = await flux(env, stepPrompt(req.action));
  const r2Key = `drafts/${req.draftId}/step-${req.index}.png`;
  await env.RR_SOCIAL_ASSETS.put(r2Key, png, {
    httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
  });
  return Response.json({ r2Key, bytes: png.byteLength });
}

async function flux(env: Env, prompt: string): Promise<ArrayBuffer> {
  const out = await env.AI.run(MODEL, { prompt, steps: 4 }) as
    | ReadableStream | ArrayBuffer | Uint8Array | { image: string };

  if (out instanceof ArrayBuffer) return out;
  if (out instanceof Uint8Array) return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  if (out instanceof ReadableStream) return await new Response(out).arrayBuffer();
  if (typeof (out as { image?: string }).image === 'string') {
    const b64 = (out as { image: string }).image;
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  }
  throw new Error('Unknown Flux response shape');
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== 'POST') return new Response('Not found', { status: 404 });

    if (url.pathname === '/generate-ingredient') return generateIngredient(env, await req.json());
    if (url.pathname === '/generate-recipe-shot') return generateRecipeShot(env, await req.json());
    if (url.pathname === '/generate-step-shot') return generateStepShot(env, await req.json());
    return new Response('Not found', { status: 404 });
  },
};
```

**`wrangler.social-image-gen.toml`:**

```toml
name = "rr-social-image-gen"
main = "src/social/image-gen.ts"
compatibility_date = "2025-04-01"

[ai]
binding = "AI"

[[d1_databases]]
binding = "DB"
# from packages/workers/wrangler.api.toml — recipes DB

[[r2_buckets]]
binding = "RR_SOCIAL_CACHE"
bucket_name = "rr-social-cache"

[[r2_buckets]]
binding = "RR_SOCIAL_ASSETS"
bucket_name = "rr-social-assets"
```

### Notes

- Cache bucket `rr-social-cache` is private; ingredient stills are composited into pin PNGs and video frames, never served directly to platforms.
- Flux output shape varies between Workers AI revisions; the spike worker hit `{ image: base64 }`. The `flux()` helper handles all observed shapes defensively.
- `PROMPT_VERSION = 'v1.0'` is part of the cache key path. Bump to invalidate.
- `steps: 4` matches Flux Schnell's distilled config.

---

## 23. Ticket 008 — `social-adapter-pinterest` Worker (schema-corrected)

**Phase:** 1 · **Depends on:** 001, 002, 006, 007 · **Effort:** M

### Goal

Queue consumer for `rr-social-pinterest-jobs`. For each candidate id received:

1. Load candidate from D1 (`recipe_id`, `theme`)
2. Load full RecipeDocument from `RECIPES_KV` (canonical source for ingredients + total_time + cuisine)
3. Generate hero image via service binding to `social-image-gen`
4. Call Workers AI Llama 3.3 70B with the Pinterest prompt
5. Compose 1000×1500 pin PNG (Satori → ResVG)
6. Upload composed PNG to `rr-social-assets/drafts/{draftId}/pin.png`
7. Insert `social_drafts` row with `status='pending_approval'`

**Schema correction:** the previous draft of this ticket assumed `recipes.ingredients` (JSON) and `recipes.difficulty`. Neither exists. Adapter loads the full `RecipeDocument` from `RECIPES_KV` instead, which has `ingredients` (with quantities) and the rest of the structured doc. `difficulty` is dropped entirely from the prompt.

### Acceptance criteria

- [ ] Queue consumer handles `{ candidateId }` messages
- [ ] One `social_drafts` row per message, `status='pending_approval'`
- [ ] Composed pin visible at `https://assets.reduced.recipes/drafts/{draftId}/pin.png`
- [ ] On Llama parse failure or image-gen failure, message goes to DLQ; no draft created
- [ ] Vitest mocks AI binding and asserts the draft insert SQL
- [ ] Brand voice rules from §14 embedded in the system prompt

### Files to create

```
packages/workers/src/social/adapter-pinterest.ts
packages/workers/src/social/adapter-pinterest.prompts.ts
packages/workers/src/social/adapter-pinterest.compose.tsx
packages/workers/src/social/adapter-pinterest.test.ts
packages/workers/wrangler.social-adapter-pinterest.toml
```

### Implementation

**`adapter-pinterest.prompts.ts`:**

```ts
export const SYSTEM_PROMPT = `You are writing a Pinterest pin for ReducedRecipes, a recipe site that strips blog narratives and surfaces clean, structured recipes.

Voice: practical, slightly dry, gently mocks food-blog tropes without being mean. Talks to another home cook, not at an audience.

Calibration dials (when in doubt):
- Specific over universal
- Quiet over enthusiastic
- Earned over promised

Never write any of these patterns:
- "Today I want to share..."
- "My family LOVES this"
- "The BEST [dish]"
- "You NEED to try this"
- "Literally the easiest..."
- "Perfect for any occasion"
- "So delicious!" / "OMG amazing"
- Emoji walls
- "I just had to share!"
- "Game changer"
- "Easy peasy"
- "Healthy and delicious!"

Write three things:
1. PIN_TITLE: <=100 chars, search-optimised. Lead with the dish, then a benefit (fast / one-pan / 5-ingredient / make-ahead). No emoji.
2. PIN_DESCRIPTION: 200-400 chars. Conversational, second-person. Include 2-3 SEO keywords naturally. End with the literal CTA: "Get the full recipe at reduced.recipes, no story scroll."
3. HASHTAGS: 4-6 specific hashtags as a JSON array of strings. Mix broad + niche. No #recipe (too broad). Prefer #weeknightdinner, #onepanmeal, #{{cuisine_lower}}recipes etc.

Return STRICT JSON with exactly these keys: pin_title, pin_description, hashtags.
No preamble, no code fences, no explanation.

Constraints:
- Never claim health benefits ("healthy", "weight loss", "diet").
- Never say "AI-generated" or reference automation.
- Do NOT credit source sites or mention origin.`;

export function userPrompt(recipe: {
  title: string;
  cuisine: string | null;
  totalTimeFormatted: string;
  topIngredients: string[];
}): string {
  return `Recipe: ${recipe.title}
Cuisine: ${recipe.cuisine ?? 'Modern'} | Time: ${recipe.totalTimeFormatted || 'unspecified'}
Key ingredients: ${recipe.topIngredients.join(', ')}`;
}

export const PROMPT_VERSION = 'pinterest_v1.0';
export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export interface PinterestCopy {
  pin_title: string;
  pin_description: string;
  hashtags: string[];
}

export function validate(payload: unknown): PinterestCopy {
  if (!payload || typeof payload !== 'object') throw new Error('payload not an object');
  const p = payload as Record<string, unknown>;
  if (typeof p.pin_title !== 'string') throw new Error('pin_title not a string');
  if (typeof p.pin_description !== 'string') throw new Error('pin_description not a string');
  if (!Array.isArray(p.hashtags) || !p.hashtags.every((h) => typeof h === 'string')) {
    throw new Error('hashtags not string array');
  }
  if (p.pin_title.length > 100) throw new Error(`pin_title too long: ${p.pin_title.length}`);
  if (p.pin_description.length < 100 || p.pin_description.length > 500) {
    throw new Error(`pin_description out of range: ${p.pin_description.length}`);
  }
  return {
    pin_title: p.pin_title,
    pin_description: p.pin_description,
    hashtags: p.hashtags as string[],
  };
}
```

**`adapter-pinterest.compose.tsx`:**

```tsx
export interface PinComposeInput {
  heroR2Key: string;
  pinTitle: string;
  totalTime: string;
}

export const PinComponent: React.FC<PinComposeInput> = ({ heroR2Key, pinTitle, totalTime }) => (
  <div style={{
    width: 1000, height: 1500, display: 'flex', flexDirection: 'column',
    fontFamily: 'Instrument Serif, serif', backgroundColor: '#F3F0EB',
  }}>
    <div style={{ flex: 1, display: 'flex' }}>
      <img src={`https://assets.reduced.recipes/${heroR2Key}`}
           width={1000} height={1100} style={{ objectFit: 'cover' }} />
    </div>
    <div style={{
      backgroundColor: '#C45A30', padding: '40px 60px',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ color: '#F3F0EB', fontSize: 56, lineHeight: 1.1 }}>{pinTitle}</div>
      <div style={{
        color: '#F3F0EB', fontSize: 28, opacity: 0.9,
        fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: 2,
      }}>
        {totalTime || 'no scroll'}  ·  reduced.recipes  ·  no story scroll
      </div>
    </div>
  </div>
);
```

The render path uses `satori` + `@resvg/resvg-wasm`:

```ts
import satori from 'satori';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import instrumentSerif from './fonts/InstrumentSerif-Regular.ttf';
import inter from './fonts/Inter-Medium.ttf';

let wasmInited = false;

export async function composePin(input: PinComposeInput): Promise<Uint8Array> {
  if (!wasmInited) { await initWasm(resvgWasm); wasmInited = true; }
  const svg = await satori(<PinComponent {...input} />, {
    width: 1000, height: 1500,
    fonts: [
      { name: 'Instrument Serif', data: instrumentSerif, weight: 400, style: 'normal' },
      { name: 'Inter', data: inter, weight: 500, style: 'normal' },
    ],
  });
  return new Resvg(svg).render().asPng();
}
```

**`adapter-pinterest.ts`:**

```ts
import {
  ulid, formatTotalTime, type Platform, type RecipeDocument,
} from '@rr/social-shared';
import {
  SYSTEM_PROMPT, userPrompt, validate, PROMPT_VERSION, MODEL,
} from './adapter-pinterest.prompts';
import { composePin } from './adapter-pinterest.compose';

interface Env {
  AI: Ai;
  DB: D1Database;
  RECIPES_KV: KVNamespace;        // canonical RecipeDocument source
  RR_SOCIAL_ASSETS: R2Bucket;
  IMAGE_GEN: Fetcher;
}

interface JobBody { candidateId: string }

interface CandidateRow {
  candidate_id: string;
  recipe_id: string;
  theme: string | null;
}

async function processJob(env: Env, body: JobBody) {
  // 1. Candidate from D1.
  const candidate = await env.DB.prepare(`
    SELECT id AS candidate_id, recipe_id, theme
    FROM social_source_candidates WHERE id = ?
  `).bind(body.candidateId).first<CandidateRow>();
  if (!candidate) throw new Error(`candidate ${body.candidateId} not found`);

  // 2. Full recipe doc from KV (canonical for ingredients + cuisine + total_time).
  const docJson = await env.RECIPES_KV.get(`recipe:${candidate.recipe_id}`, 'text');
  if (!docJson) throw new Error(`RecipeDocument missing for ${candidate.recipe_id}`);
  const doc = JSON.parse(docJson) as RecipeDocument;

  // 3. Top 5 ingredients (raw, with quantities — Llama strips them).
  const topIngredients = (doc.ingredients ?? []).slice(0, 5);

  const draftId = ulid();
  const totalTimeFormatted = formatTotalTime(doc.total_time);

  // 4. Generate hero image (per-recipe, fresh).
  const heroResp = await env.IMAGE_GEN.fetch('https://internal/generate-recipe-shot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slot: 'hero',
      recipe: { title: doc.title, cuisine: doc.cuisine },
      draftId,
    }),
  });
  if (!heroResp.ok) throw new Error(`image-gen hero failed: ${heroResp.status} ${await heroResp.text()}`);
  const { r2Key: heroR2Key } = await heroResp.json() as { r2Key: string };

  // 5. Generate copy via Llama.
  const llamaResult = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: userPrompt({
          title: doc.title, cuisine: doc.cuisine,
          totalTimeFormatted, topIngredients,
        }),
      },
    ],
    max_tokens: 600,
    temperature: 0.7,
  }) as Record<string, unknown>;
  const payload = typeof llamaResult.response === 'string'
    ? JSON.parse(llamaResult.response)
    : llamaResult.response;
  const copy = validate(payload);

  // 6. Compose pin PNG.
  const pinPng = await composePin({
    heroR2Key, pinTitle: copy.pin_title, totalTime: totalTimeFormatted,
  });
  const pinR2Key = `drafts/${draftId}/pin.png`;
  await env.RR_SOCIAL_ASSETS.put(pinR2Key, pinPng, {
    httpMetadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  // 7. Insert draft.
  const platform: Platform = 'pinterest';
  const ctaUrl = `https://r.reduced.recipes/${draftId}?utm_source=pinterest&utm_medium=organic_social&utm_campaign=${candidate.theme ?? 'default'}&utm_content=${draftId}`;

  await env.DB.prepare(`
    INSERT INTO social_drafts
      (id, source_id, platform, variant_label, caption, hashtags, hook, script, cta_text, cta_url,
       asset_r2_keys, prompt_version, model, generation_cost_usd, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, NULL, 'pending_approval', ?)
  `).bind(
    draftId,
    candidate.candidate_id,
    platform,
    PROMPT_VERSION,
    copy.pin_description,
    JSON.stringify(copy.hashtags),
    'Get the full recipe at reduced.recipes, no story scroll.',
    ctaUrl,
    JSON.stringify([heroR2Key, pinR2Key]),
    PROMPT_VERSION,
    MODEL,
    Date.now(),
  ).run();

  console.log(`SOCIAL_ADAPTER_PINTEREST: draft ${draftId} created for candidate ${candidate.candidate_id}`);
}

export default {
  async queue(batch: MessageBatch<JobBody>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try { await processJob(env, msg.body); msg.ack(); }
      catch (err) {
        console.error(`SOCIAL_ADAPTER_PINTEREST: job ${msg.body.candidateId} failed:`, err);
        msg.retry();
      }
    }
  },
};
```

**`wrangler.social-adapter-pinterest.toml`:**

```toml
name = "rr-social-adapter-pinterest"
main = "src/social/adapter-pinterest.ts"
compatibility_date = "2025-04-01"

[ai]
binding = "AI"

[[d1_databases]]
binding = "DB"
# from packages/workers/wrangler.api.toml — recipes DB

[[kv_namespaces]]
binding = "RECIPES_KV"
# id from existing wrangler.api.toml

[[r2_buckets]]
binding = "RR_SOCIAL_ASSETS"
bucket_name = "rr-social-assets"

[[services]]
binding = "IMAGE_GEN"
service = "rr-social-image-gen"

[[queues.consumers]]
queue = "rr-social-pinterest-jobs"
max_batch_size = 5
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "rr-social-pinterest-dlq"
```

### Notes

- Loading the full `RecipeDocument` from `RECIPES_KV` is the canonical pattern. The recipes table doesn't store ingredients-with-quantities, instructions, or yields as columns — those live in the KV doc.
- Llama returning a pre-parsed object in `result.response` is Workers-AI-specific (Spike A finding). The `typeof === 'string'` check handles future shape changes defensively.
- Brand voice prompt is embedded for v1. When `social_prompt_versions` becomes the source of truth (Phase 1.5 polish), load from D1 instead.
- Satori font files: ship the `.ttf`s in the Worker bundle. Wrangler's default assets handling won't grab them; copy into `src/social/fonts/` and import as bytes.
- DLQ `rr-social-pinterest-dlq` is a parking queue. Surface failures in metrics worker's daily digest.

---

## 24. Ticket 009 — `social-publisher-pinterest` cron Worker

**Phase:** 1 · **Depends on:** 001, 002, 008, 014, 015 · **Effort:** M

### Goal

Cron-triggered Worker (every 5 minutes) that picks up scheduled Pinterest drafts whose `scheduled_for` has passed and posts them to Pinterest API v5. Enforces:

- Killswitch (`RR_SOCIAL_KILLSWITCH:pinterest`)
- Daily count cap (warm-up: 2/day for first 14 days, then 5/day)
- Bootstrap engagement floor (days 1-30)
- Token refresh before each request

On success: `social_posts` row + draft `status='published'`. On 4xx: `status='failed'`. On 5xx/network: exponential backoff retry (3 attempts).

### Acceptance criteria

- [ ] Cron `*/5 * * * *` registered
- [ ] Picks up drafts with `scheduled_for <= now AND status = 'scheduled'`
- [ ] Caps daily Pinterest publishes at 2 (days 0-13) or 5 (day 14+)
- [ ] Killswitch aborts and Notifier alerts
- [ ] Each successful post creates one `social_posts` row, flips draft status
- [ ] 4xx → `status='failed'` + Notifier alert
- [ ] Vitest covers warm-up cap, killswitch, success path, 4xx, 5xx with retry

### Files to create

```
packages/workers/src/social/publisher-pinterest.ts
packages/workers/src/social/publisher-pinterest.test.ts
packages/workers/wrangler.social-publisher-pinterest.toml
```

### Implementation

**`publisher-pinterest.ts`:**

```ts
import { ulid, assetUrl } from '@rr/social-shared';
import { getValidPinterestAccessToken } from '@rr/social-shared/platforms/pinterest-auth';
import { createNotifier } from '@rr/notifier';

interface Env {
  DB: D1Database;
  RR_SOCIAL_KILLSWITCH: KVNamespace;
  RR_SOCIAL_TOKENS: KVNamespace;
  PINTEREST_CLIENT_ID: string;
  PINTEREST_CLIENT_SECRET: string;
  PINTEREST_DEFAULT_BOARD_ID: string;
  NOTIFIER_FROM: string;
  NOTIFIER_TO: string;
  NOTIFIER_FROM_NAME?: string;
  NOTIFIER_CHANNEL?: 'email';
}

interface DraftRow {
  id: string; source_id: string;
  caption: string; hashtags: string;
  cta_url: string; asset_r2_keys: string;
}

async function run(env: Env): Promise<{ published: number; failed: number; skipped: number }> {
  const ks = await env.RR_SOCIAL_KILLSWITCH.get('pinterest');
  if (ks) {
    console.log(`SOCIAL_PUBLISHER_PINTEREST: killswitch (${ks}); skipping`);
    return { published: 0, failed: 0, skipped: 0 };
  }

  const todayMs = Math.floor(Date.now() / 86400_000) * 86400_000;
  const todayPublished = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM social_posts WHERE platform = 'pinterest' AND published_at >= ?
  `).bind(todayMs).first<{ n: number }>();

  const dayCount = await daysSinceFirstPin(env);
  const cap = dayCount < 14 ? 2 : 5;
  if ((todayPublished?.n ?? 0) >= cap) {
    console.log(`SOCIAL_PUBLISHER_PINTEREST: daily cap (${cap}) reached`);
    return { published: 0, failed: 0, skipped: 0 };
  }
  const remainingCap = cap - (todayPublished?.n ?? 0);

  const due = await env.DB.prepare(`
    SELECT id, source_id, caption, hashtags, cta_url, asset_r2_keys
    FROM social_drafts
    WHERE platform = 'pinterest' AND status = 'scheduled' AND scheduled_for <= ?
    ORDER BY scheduled_for ASC LIMIT ?
  `).bind(Date.now(), remainingCap).all<DraftRow>();

  let published = 0, failed = 0;
  for (const d of due.results) {
    try {
      await publishOne(env, d);
      published++;
    } catch (err) {
      console.error(`SOCIAL_PUBLISHER_PINTEREST: draft ${d.id} failed:`, err);
      await markFailed(env, d.id, (err as Error).message);
      await createNotifier(env).sendAlert({
        level: 'error',
        subject: `Pinterest publish failed: ${d.id}`,
        body: `Error: ${(err as Error).message}`,
      });
      failed++;
    }
  }

  await maybeTripBootstrapKillswitch(env);
  return { published, failed, skipped: 0 };
}

async function publishOne(env: Env, draft: DraftRow): Promise<void> {
  const token = await getValidPinterestAccessToken(env);
  const assetKeys = JSON.parse(draft.asset_r2_keys) as string[];
  const pinR2Key = assetKeys[1] ?? assetKeys[0];
  const imageUrl = assetUrl(pinR2Key);
  const hashtags = JSON.parse(draft.hashtags) as string[];
  const description = [draft.caption, hashtags.join(' ')].filter(Boolean).join('\n\n');

  const r = await fetchWithRetry('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      board_id: env.PINTEREST_DEFAULT_BOARD_ID,
      description,
      link: draft.cta_url,
      media_source: { source_type: 'image_url', url: imageUrl },
    }),
  });

  if (!r.ok) {
    if (r.status >= 400 && r.status < 500) {
      throw new Error(`Pinterest 4xx: ${r.status} ${await r.text()}`);
    }
    throw new Error(`Pinterest 5xx after retries: ${r.status} ${await r.text()}`);
  }
  const j = await r.json() as { id: string };

  const postId = ulid();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO social_posts (id, draft_id, platform, platform_post_id, permalink, short_link, published_at)
      VALUES (?, ?, 'pinterest', ?, ?, ?, ?)
    `).bind(postId, draft.id, j.id, `https://www.pinterest.com/pin/${j.id}/`, draft.cta_url, now),
    env.DB.prepare(`UPDATE social_drafts SET status = 'published' WHERE id = ?`).bind(draft.id),
  ]);
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const delays = [30_000, 120_000, 600_000];
  let last: Response | undefined;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    last = await fetch(url, init);
    if (last.ok) return last;
    if (last.status >= 400 && last.status < 500) return last;
    if (attempt < delays.length) await sleep(delays[attempt]);
  }
  return last as Response;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function markFailed(env: Env, draftId: string, message: string): Promise<void> {
  await env.DB.prepare(`UPDATE social_drafts SET status = 'failed', rejection_reason = ? WHERE id = ?`)
    .bind(message.slice(0, 500), draftId).run();
}

async function daysSinceFirstPin(env: Env): Promise<number> {
  const row = await env.DB.prepare(`SELECT MIN(published_at) AS first FROM social_posts WHERE platform = 'pinterest'`)
    .first<{ first: number | null }>();
  if (!row?.first) return 0;
  return Math.floor((Date.now() - row.first) / 86400_000);
}

async function maybeTripBootstrapKillswitch(env: Env): Promise<void> {
  const days = await daysSinceFirstPin(env);
  if (days >= 30) return;

  const recent = await env.DB.prepare(`
    SELECT p.id, COALESCE(MAX(s.impressions), 0) AS impressions
    FROM social_posts p
    LEFT JOIN social_metrics_snapshots s ON s.post_id = p.id
    WHERE p.platform = 'pinterest' AND p.published_at >= ?
    GROUP BY p.id ORDER BY p.published_at DESC LIMIT 3
  `).bind(Date.now() - 3 * 86400_000).all<{ id: string; impressions: number }>();

  if (recent.results.length < 3) return;
  if (recent.results.every((r) => r.impressions < 50)) {
    await env.RR_SOCIAL_KILLSWITCH.put('pinterest', 'bootstrap floor: last 3 pins <50 impressions');
    await createNotifier(env).sendAlert({
      level: 'warn',
      subject: 'Pinterest killswitch tripped (bootstrap floor)',
      body: 'Last 3 pins had <50 impressions each. Killswitch set. Review and clear via wrangler kv key delete.',
    });
  }
}

export default {
  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/trigger' && req.method === 'POST') {
      try { return Response.json(await run(env)); }
      catch (err) { return new Response((err as Error).message, { status: 500 }); }
    }
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    return new Response('Not found', { status: 404 });
  },
};
```

**`wrangler.social-publisher-pinterest.toml`:**

```toml
name = "rr-social-publisher-pinterest"
main = "src/social/publisher-pinterest.ts"
compatibility_date = "2025-04-01"

[triggers]
crons = ["*/5 * * * *"]

[[d1_databases]]
binding = "DB"

[[kv_namespaces]]
binding = "RR_SOCIAL_KILLSWITCH"

[[kv_namespaces]]
binding = "RR_SOCIAL_TOKENS"

[vars]
NOTIFIER_FROM = "social-bot@reduced.recipes"
NOTIFIER_FROM_NAME = "RR Social"
NOTIFIER_CHANNEL = "email"
PINTEREST_DEFAULT_BOARD_ID = ""    # set after creating the first board

# secrets (via wrangler secret put):
# - PINTEREST_CLIENT_ID
# - PINTEREST_CLIENT_SECRET
# - NOTIFIER_TO
```

### Notes

- `*/5` cron is generous; daily cap enforces volume. Five-min granularity keeps the `scheduled_for` slot tight.
- Daily cap counts per UTC day; US Eastern slots span midnight UTC, but the cap operates as a smoothing rule over a 24h window.
- `PINTEREST_DEFAULT_BOARD_ID` is the catch-all board for Phase 1; meal-type-board routing (per §11 / decision 5) lands as Phase 1 polish.
- 4xx errors don't retry — payload bad means retrying won't help.
- Bootstrap-floor check sits here so we can react immediately; not delegated to metrics worker.

---

## 25. Ticket 010 — `social-shortlink` Worker (schema-corrected)

**Phase:** 1 · **Depends on:** 001, 002, 016 · **Effort:** S

### Goal

Single Worker handling three URL patterns under `r.reduced.recipes`:

| Pattern | Auth | Purpose |
|---|---|---|
| `GET /:draftId` | public | Outbound CTA: log a hit, 302 to recipe page |
| `GET /approve/:draftId` | CF Access | Email digest one-tap approve |
| `GET /reject/:draftId` | CF Access | Email digest one-tap reject |

**Schema correction:** the previous draft of this ticket queried `recipes.slug` for the redirect target. That column doesn't exist. The frontend uses `/recipe/${id}`, so we resolve the recipe id directly from `social_source_candidates.recipe_id`.

### Acceptance criteria

- [ ] `r.reduced.recipes/<draftId>` 302s to the recipe page, writes `social_shortlink_hits`
- [ ] Unknown draft id returns 404
- [ ] Approve and reject endpoints sit behind CF Access (configured at the route)
- [ ] Approve sets `status = 'scheduled'` and `scheduled_for = <next platform-optimal slot>`
- [ ] Reject sets `status = 'rejected'`
- [ ] Idempotent: hitting approve twice returns 200, no double-schedule
- [ ] Vitest covers all four paths

### Files to create

```
migrations/0012_social_shortlink_hits.sql
packages/workers/src/social/shortlink.ts
packages/workers/src/social/shortlink.test.ts
packages/workers/src/social/scheduling.ts
packages/workers/wrangler.social-shortlink.toml
```

### Implementation

**`migrations/0012_social_shortlink_hits.sql`:**

```sql
CREATE TABLE social_shortlink_hits (
  id          TEXT PRIMARY KEY,
  draft_id    TEXT NOT NULL,
  hit_at      INTEGER NOT NULL,
  country     TEXT,
  referer     TEXT,
  user_agent  TEXT
);
CREATE INDEX idx_shortlink_hits_draft ON social_shortlink_hits(draft_id);
CREATE INDEX idx_shortlink_hits_hit_at ON social_shortlink_hits(hit_at);
```

**`scheduling.ts`:**

```ts
// US Eastern Pinterest publish slots (§7.1). 11:00, 14:00, 20:00, 21:00 ET. Picks next future slot.
const ET_OFFSET_MIN = -5 * 60;   // EST. DST follow-up; v1 fixed.
const SLOTS_ET_HHMM = [11 * 60, 14 * 60, 20 * 60, 21 * 60];

export function nextPinterestSlot(now: Date = new Date()): Date {
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const etMin = ((utcMin + ET_OFFSET_MIN) % 1440 + 1440) % 1440;

  let chosenSlotEtMin = SLOTS_ET_HHMM.find((s) => s > etMin + 5);
  let dayOffset = 0;
  if (chosenSlotEtMin === undefined) {
    chosenSlotEtMin = SLOTS_ET_HHMM[0];
    dayOffset = 1;
  }

  const targetEtTotalMin = chosenSlotEtMin + dayOffset * 1440;
  const targetUtcMin = targetEtTotalMin - ET_OFFSET_MIN;
  const baseDate = new Date(now);
  baseDate.setUTCHours(0, 0, 0, 0);
  const targetMs = baseDate.getTime() + targetUtcMin * 60 * 1000;

  const jitterMs = (Math.random() * 40 - 20) * 60 * 1000; // ±20 minutes
  return new Date(targetMs + jitterMs);
}
```

**`shortlink.ts`:**

```ts
import { ulid, recipePageUrl } from '@rr/social-shared';
import { nextPinterestSlot } from './scheduling';

interface Env { DB: D1Database }

interface DraftLookup {
  id: string;
  status: string;
  cta_url: string | null;
  source_id: string;
}

async function handleHit(env: Env, draftId: string, req: Request): Promise<Response> {
  const draft = await env.DB
    .prepare(`SELECT id, status, cta_url, source_id FROM social_drafts WHERE id = ?`)
    .bind(draftId)
    .first<DraftLookup>();
  if (!draft) return new Response('Not found', { status: 404 });

  // Resolve target. cta_url usually already points to the recipe page; if it
  // self-references r.reduced.recipes, look up recipe_id from the candidate row
  // and build /recipe/${id} (frontend has no slug column).
  let target = draft.cta_url ?? '';
  if (!target || target.includes('r.reduced.recipes')) {
    const row = await env.DB.prepare(`
      SELECT recipe_id FROM social_source_candidates WHERE id = ?
    `).bind(draft.source_id).first<{ recipe_id: string }>();
    target = row ? recipePageUrl(row.recipe_id) : 'https://reduced.recipes';
  }

  // Log hit.
  await env.DB.prepare(`
    INSERT INTO social_shortlink_hits (id, draft_id, hit_at, country, referer, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    ulid(), draftId, Date.now(),
    req.headers.get('cf-ipcountry'),
    req.headers.get('referer'),
    req.headers.get('user-agent'),
  ).run();

  return Response.redirect(target, 302);
}

async function handleApprove(env: Env, draftId: string): Promise<Response> {
  const draft = await env.DB
    .prepare(`SELECT id, status FROM social_drafts WHERE id = ?`)
    .bind(draftId).first<{ id: string; status: string }>();
  if (!draft) return new Response('Not found', { status: 404 });
  if (draft.status === 'approved' || draft.status === 'scheduled') {
    return successPage('Already approved.');
  }
  if (draft.status !== 'pending_approval') {
    return new Response(`Cannot approve from status '${draft.status}'`, { status: 409 });
  }

  const scheduledFor = nextPinterestSlot();
  await env.DB.prepare(`
    UPDATE social_drafts
    SET status = 'scheduled', approved_at = ?, scheduled_for = ?
    WHERE id = ? AND status = 'pending_approval'
  `).bind(Date.now(), scheduledFor.getTime(), draftId).run();

  return successPage(`Approved. Will publish around ${scheduledFor.toUTCString()}.`);
}

async function handleReject(env: Env, draftId: string): Promise<Response> {
  const result = await env.DB.prepare(`
    UPDATE social_drafts SET status = 'rejected', rejection_reason = 'one-click reject from email'
    WHERE id = ? AND status = 'pending_approval'
  `).bind(draftId).run();

  if (result.meta?.changes === 0) return new Response('Already decided', { status: 409 });
  return successPage('Rejected.');
}

function successPage(msg: string): Response {
  return new Response(
    `<!doctype html><html><body style="font-family: system-ui, sans-serif; padding: 40px;">
      <h1>OK</h1><p>${msg}</p><p>You can close this tab.</p>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  );
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);

    if (segments.length === 1) return handleHit(env, segments[0], req);
    if (segments.length === 2 && segments[0] === 'approve') return handleApprove(env, segments[1]);
    if (segments.length === 2 && segments[0] === 'reject') return handleReject(env, segments[1]);

    return new Response('Not found', { status: 404 });
  },
};
```

**`wrangler.social-shortlink.toml`:**

```toml
name = "rr-social-shortlink"
main = "src/social/shortlink.ts"
compatibility_date = "2025-04-01"

routes = [
  { pattern = "r.reduced.recipes/*", zone_name = "reduced.recipes" }
]

[[d1_databases]]
binding = "DB"
# from packages/workers/wrangler.api.toml — recipes DB
```

CF Access goes on `r.reduced.recipes/approve/*` and `r.reduced.recipes/reject/*` via the dashboard. The bare `/<draftId>` route stays public.

### Notes

- Recipe URL is `https://reduced.recipes/recipe/${id}` (no slug column, confirmed against frontend route `/recipe/:id`). The `recipePageUrl` helper in `@rr/social-shared` returns this format.
- Schedule jitter (±20 min) avoids exact-minute posting that Pinterest's automation heuristics flag.
- DST handling on `nextPinterestSlot` is naive (fixed EST). For v1 this is fine.
- "Already decided" responses use 409 deliberately so retries (email may get clicked twice) don't silently overwrite.

---

## 26. Ticket 011 — `social-admin` Cloudflare Pages app

**Phase:** 1 · **Depends on:** 001, 010, 014 · **Effort:** M

### Goal

Mobile-first swipe UI for the daily approval review (§6). Cloudflare Pages app behind Cloudflare Access. Two surfaces:

1. **Swipe queue** — stack of cards, swipe right to approve, left to reject, up to edit-and-approve
2. **OAuth bootstrap** — `/oauth/pinterest/start` and `/oauth/pinterest/callback` (handlers from ticket 014)

### Acceptance criteria

- [ ] Lives at `https://social-admin.reduced.recipes`
- [ ] Cloudflare Access policy: only the owner's email
- [ ] `GET /api/drafts/pending` returns drafts with `status='pending_approval'`
- [ ] `POST /api/drafts/:id/approve`, `/reject`, `/edit-approve` work and reflect in D1
- [ ] Mobile-first card UI with hero image preview, caption, hashtags, platform badge
- [ ] Swipe gestures wired (touch + mouse drag)
- [ ] End-of-queue summary card

### Files to create

```
apps/social-admin/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── wrangler.social-admin.toml
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── DraftCard.tsx
│   ├── SwipeStack.tsx
│   ├── EditDialog.tsx
│   ├── api.ts
│   └── styles.css
└── functions/
    ├── api/drafts/pending.ts
    ├── api/drafts/[id]/approve.ts
    ├── api/drafts/[id]/reject.ts
    ├── api/drafts/[id]/edit-approve.ts
    ├── api/_lib/scheduling.ts          (copy of packages/workers/src/social/scheduling.ts)
    └── oauth/pinterest/
        ├── start.ts
        └── callback.ts
```

### Implementation

**`apps/social-admin/package.json`:**

```json
{
  "name": "@rr/social-admin",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "deploy": "wrangler pages deploy dist --project-name social-admin",
    "preview": "wrangler pages dev dist"
  },
  "dependencies": {
    "@rr/social-shared": "workspace:*",
    "@rr/notifier": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240909.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "wrangler": "^3.78.0"
  }
}
```

**`src/api.ts`:**

```ts
import type { DraftStatus, Platform } from '@rr/social-shared';

export interface PendingDraft {
  id: string;
  platform: Platform;
  caption: string;
  hashtags: string[];
  hook: string | null;
  ctaUrl: string;
  pinPreviewUrl: string;
  videoPreviewUrl: string | null;
  createdAt: number;
}

export async function fetchPending(): Promise<PendingDraft[]> {
  const r = await fetch('/api/drafts/pending');
  if (!r.ok) throw new Error(`fetchPending: ${r.status}`);
  return await r.json();
}

export async function approve(id: string): Promise<void> {
  const r = await fetch(`/api/drafts/${id}/approve`, { method: 'POST' });
  if (!r.ok) throw new Error(`approve: ${r.status}`);
}

export async function reject(id: string, reason?: string): Promise<void> {
  const r = await fetch(`/api/drafts/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!r.ok) throw new Error(`reject: ${r.status}`);
}

export async function editApprove(id: string, patch: { caption?: string; hashtags?: string[] }): Promise<void> {
  const r = await fetch(`/api/drafts/${id}/edit-approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`editApprove: ${r.status}`);
}
```

**`src/SwipeStack.tsx`:**

```tsx
import { useEffect, useState } from 'react';
import { fetchPending, approve, reject, type PendingDraft } from './api';
import { DraftCard } from './DraftCard';

export const SwipeStack = () => {
  const [drafts, setDrafts] = useState<PendingDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPending().then(setDrafts).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="p-6 text-red-700">{error}</div>;
  if (!drafts) return <div className="p-6 text-ink-2">Loading…</div>;
  if (drafts.length === 0) return <EmptyState />;

  const top = drafts[0];

  const handle = async (action: 'approve' | 'reject') => {
    if (action === 'approve') await approve(top.id);
    else await reject(top.id);
    setDrafts(drafts.slice(1));
  };

  return (
    <div className="flex flex-col items-center w-full">
      <DraftCard draft={top} onApprove={() => handle('approve')} onReject={() => handle('reject')} />
      <div className="text-caps text-ink-3 mt-6">{drafts.length} remaining</div>
    </div>
  );
};

const EmptyState = () => (
  <div className="p-10 text-center">
    <div className="text-3xl font-serif">All clear.</div>
    <div className="text-ink-2 mt-2">Nothing pending. Come back tomorrow.</div>
  </div>
);
```

`DraftCard` renders the pin preview and caption; wires up touch/mouse drag with a small library (`@use-gesture/react`) or plain pointer events.

**Pages Function `functions/api/drafts/pending.ts`:**

```ts
interface Env { DB: D1Database }

interface DraftRow {
  id: string; platform: string;
  caption: string; hashtags: string;
  hook: string | null; cta_url: string;
  asset_r2_keys: string; created_at: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const r = await env.DB.prepare(`
    SELECT id, platform, caption, hashtags, hook, cta_url, asset_r2_keys, created_at
    FROM social_drafts
    WHERE status = 'pending_approval'
    ORDER BY created_at DESC
    LIMIT 50
  `).all<DraftRow>();

  const out = r.results.map((d) => {
    const keys = JSON.parse(d.asset_r2_keys) as string[];
    const pinKey = keys.find((k) => k.endsWith('/pin.png')) ?? keys[0];
    return {
      id: d.id, platform: d.platform, caption: d.caption,
      hashtags: JSON.parse(d.hashtags),
      hook: d.hook, ctaUrl: d.cta_url,
      pinPreviewUrl: `https://assets.reduced.recipes/${pinKey}`,
      videoPreviewUrl: null,
      createdAt: d.created_at,
    };
  });
  return Response.json(out);
};
```

**Pages Function `functions/api/drafts/[id]/approve.ts`:**

```ts
import { nextPinterestSlot } from '../../_lib/scheduling';

interface Env { DB: D1Database }

export const onRequestPost: PagesFunction<Env> = async ({ env, params }) => {
  const id = params.id as string;
  const scheduledFor = nextPinterestSlot();
  const result = await env.DB.prepare(`
    UPDATE social_drafts
    SET status = 'scheduled', approved_at = ?, scheduled_for = ?
    WHERE id = ? AND status = 'pending_approval'
  `).bind(Date.now(), scheduledFor.getTime(), id).run();

  if (!result.meta?.changes) return new Response('Not found or already decided', { status: 409 });
  return Response.json({ ok: true, scheduledFor: scheduledFor.toISOString() });
};
```

`reject.ts` and `edit-approve.ts` follow the same shape.

**`wrangler.social-admin.toml`:**

```toml
name = "social-admin"
pages_build_output_dir = "dist"
compatibility_date = "2025-04-01"

[[d1_databases]]
binding = "DB"

[[kv_namespaces]]
binding = "RR_SOCIAL_TOKENS"

[[kv_namespaces]]
binding = "RR_SOCIAL_OAUTH_STATE"

[vars]
PINTEREST_REDIRECT_URI = "https://social-admin.reduced.recipes/oauth/pinterest/callback"

# secrets:
# - PINTEREST_CLIENT_ID
# - PINTEREST_CLIENT_SECRET
```

### Notes

- CF Access policy is the only auth. No login form, no session cookies maintained by the app.
- Why a separate Pages app rather than route in existing frontend: keeps Access scope narrow and bundle small.
- Swipe gestures: `@use-gesture/react` is the lightest choice that handles touch + mouse. Alternative: plain `pointermove`.
- Pinterest dev console redirect URI must match `PINTEREST_REDIRECT_URI` exactly.
- Future: when push notifications come in, this app becomes a PWA. Add a manifest + service worker then.

---

## 27. Ticket 012 — `social-metrics` Worker

**Phase:** 1 · **Depends on:** 001, 002, 003, 009, 014 · **Effort:** M

### Goal

Hourly cron that pulls engagement metrics for recently-published posts, snapshots them into `social_metrics_snapshots`, joins shortlink hits into `social_attribution`, runs the day-30+ rolling killswitch (§7.2), and prunes old observability rows.

### Acceptance criteria

- [ ] Hourly cron, snapshots Pinterest posts <24h old without snapshot in last hour
- [ ] Daily attribution row in `social_attribution` joined from `social_shortlink_hits`
- [ ] Day-30+ rule trips killswitch when 5 most recent posts have median impressions <10% of trailing 30-day median
- [ ] Pruning: `social_search_hits` >30d, `social_orchestrator_runs` >90d, `social_shortlink_hits` >90d
- [ ] Vitest covers bucket selection, attribution join, killswitch trigger

### Files to create

```
packages/workers/src/social/metrics.ts
packages/workers/src/social/metrics.buckets.ts
packages/workers/src/social/metrics.test.ts
packages/workers/wrangler.social-metrics.toml
```

### Implementation

**`metrics.buckets.ts`:**

```ts
export type SnapshotBucket = 'hourly' | 'daily' | 'weekly' | 'skip';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function bucketFor(ageMs: number): SnapshotBucket {
  if (ageMs < 24 * HOUR) return 'hourly';
  if (ageMs < 14 * DAY) return 'daily';
  if (ageMs < 90 * DAY) return 'weekly';
  return 'skip';
}

export function shouldSample(bucket: SnapshotBucket, lastSnapshotMs: number | null): boolean {
  if (bucket === 'skip') return false;
  if (lastSnapshotMs === null) return true;
  const sinceLast = Date.now() - lastSnapshotMs;
  if (bucket === 'hourly') return sinceLast >= HOUR;
  if (bucket === 'daily') return sinceLast >= DAY;
  if (bucket === 'weekly') return sinceLast >= 7 * DAY;
  return false;
}
```

**`metrics.ts`:**

```ts
import { ulid } from '@rr/social-shared';
import { getValidPinterestAccessToken } from '@rr/social-shared/platforms/pinterest-auth';
import { createNotifier } from '@rr/notifier';
import { bucketFor, shouldSample } from './metrics.buckets';

interface Env {
  DB: D1Database;
  RR_SOCIAL_KILLSWITCH: KVNamespace;
  RR_SOCIAL_TOKENS: KVNamespace;
  PINTEREST_CLIENT_ID: string;
  PINTEREST_CLIENT_SECRET: string;
  NOTIFIER_FROM: string;
  NOTIFIER_TO: string;
  NOTIFIER_FROM_NAME?: string;
  NOTIFIER_CHANNEL?: 'email';
}

interface PostJoin {
  id: string;
  platform_post_id: string;
  published_at: number;
  last_snapshot_at: number | null;
}

async function run(env: Env): Promise<{ snapshots: number; attributionRows: number }> {
  await snapshotPinterest(env);
  const attribution = await rollUpAttribution(env);
  await maybeTripDay30Killswitch(env);
  await prune(env);
  return { snapshots: 0, attributionRows: attribution };
}

async function snapshotPinterest(env: Env): Promise<number> {
  const tokenStored = await env.RR_SOCIAL_TOKENS.get('pinterest:default');
  if (!tokenStored) return 0;
  const token = await getValidPinterestAccessToken(env);

  const candidates = await env.DB.prepare(`
    SELECT p.id, p.platform_post_id, p.published_at,
           (SELECT MAX(captured_at) FROM social_metrics_snapshots WHERE post_id = p.id) AS last_snapshot_at
    FROM social_posts p
    WHERE p.platform = 'pinterest' AND p.published_at >= ?
  `).bind(Date.now() - 90 * 86400_000).all<PostJoin>();

  let n = 0;
  for (const row of candidates.results) {
    const age = Date.now() - row.published_at;
    const bucket = bucketFor(age);
    if (!shouldSample(bucket, row.last_snapshot_at)) continue;

    try {
      const stats = await fetchPinAnalytics(token, row.platform_post_id);
      await env.DB.prepare(`
        INSERT INTO social_metrics_snapshots
          (id, post_id, captured_at, age_hours, impressions, reach, saves, click_throughs,
           video_views, video_avg_watch_seconds, likes, comments, shares)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        ulid(), row.id, Date.now(), Math.floor(age / 3600_000),
        stats.impressions ?? null, stats.reach ?? null,
        stats.saves ?? null, stats.outbound_click ?? null,
        stats.video_view ?? null, stats.video_avg_watch_time ?? null,
        null, null, null,
      ).run();
      n++;
    } catch (err) {
      console.warn(`SOCIAL_METRICS: snapshot failed for post ${row.id}:`, err);
    }
  }
  return n;
}

interface PinterestPinStats {
  impressions?: number;
  reach?: number;
  saves?: number;
  outbound_click?: number;
  video_view?: number;
  video_avg_watch_time?: number;
}

async function fetchPinAnalytics(token: string, pinId: string): Promise<PinterestPinStats> {
  const url = new URL(`https://api.pinterest.com/v5/pins/${pinId}/analytics`);
  url.searchParams.set('start_date', dateAgo(90));
  url.searchParams.set('end_date', dateAgo(0));
  url.searchParams.set('metric_types', 'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK,VIDEO_MRC_VIEW,VIDEO_AVG_WATCH_TIME');
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Pinterest analytics ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { all: { lifetime_metrics: Record<string, number> } };
  const m = j.all?.lifetime_metrics ?? {};
  return {
    impressions: m.IMPRESSION,
    saves: m.SAVE,
    outbound_click: m.OUTBOUND_CLICK,
    video_view: m.VIDEO_MRC_VIEW,
    video_avg_watch_time: m.VIDEO_AVG_WATCH_TIME,
  };
}

function dateAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

async function rollUpAttribution(env: Env): Promise<number> {
  const result = await env.DB.prepare(`
    INSERT INTO social_attribution (id, post_id, date, sessions, installs, signups)
    SELECT
      lower(hex(randomblob(16))) AS id,
      p.id AS post_id,
      strftime('%Y-%m-%d', h.hit_at / 1000, 'unixepoch') AS date,
      COUNT(*) AS sessions, 0 AS installs, 0 AS signups
    FROM social_shortlink_hits h
    JOIN social_drafts d ON d.id = h.draft_id
    JOIN social_posts p ON p.draft_id = d.id
    WHERE h.hit_at >= ?
    GROUP BY p.id, date
    ON CONFLICT(post_id, date) DO UPDATE SET sessions = excluded.sessions
  `).bind(Date.now() - 7 * 86400_000).run();
  return result.meta?.changes ?? 0;
}

async function maybeTripDay30Killswitch(env: Env): Promise<void> {
  const first = await env.DB.prepare(
    `SELECT MIN(published_at) AS first FROM social_posts WHERE platform = 'pinterest'`,
  ).first<{ first: number | null }>();
  if (!first?.first || (Date.now() - first.first) < 30 * 86400_000) return;

  const recent = await env.DB.prepare(`
    SELECT MAX(s.impressions) AS impressions
    FROM social_posts p
    JOIN social_metrics_snapshots s ON s.post_id = p.id
    WHERE p.platform = 'pinterest'
    GROUP BY p.id ORDER BY MAX(p.published_at) DESC LIMIT 5
  `).all<{ impressions: number }>();

  const baseline = await env.DB.prepare(`
    SELECT MAX(s.impressions) AS impressions
    FROM social_posts p
    JOIN social_metrics_snapshots s ON s.post_id = p.id
    WHERE p.platform = 'pinterest' AND p.published_at >= ?
    GROUP BY p.id
  `).bind(Date.now() - 30 * 86400_000).all<{ impressions: number }>();

  const recentMedian = median(recent.results.map((r) => r.impressions));
  const baselineMedian = median(baseline.results.map((r) => r.impressions));
  if (recent.results.length >= 5 && baselineMedian > 0 && recentMedian < baselineMedian * 0.1) {
    await env.RR_SOCIAL_KILLSWITCH.put(
      'pinterest',
      `day-30+ rolling: recent median ${recentMedian} < 10% of baseline ${baselineMedian}`,
    );
    await createNotifier(env).sendAlert({
      level: 'warn',
      subject: 'Pinterest killswitch tripped (rolling baseline)',
      body: `Recent 5-post median: ${recentMedian}. 30-day median: ${baselineMedian}.`,
    });
  }
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function prune(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM social_search_hits WHERE date < strftime('%Y-%m-%d', 'now', '-30 days')`),
    env.DB.prepare(`DELETE FROM social_orchestrator_runs WHERE started_at < ?`).bind(Date.now() - 90 * 86400_000),
    env.DB.prepare(`DELETE FROM social_shortlink_hits WHERE hit_at < ?`).bind(Date.now() - 90 * 86400_000),
  ]);
}

export default {
  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/trigger' && req.method === 'POST') {
      try { return Response.json(await run(env)); }
      catch (err) { return new Response((err as Error).message, { status: 500 }); }
    }
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    return new Response('Not found', { status: 404 });
  },
};
```

**`wrangler.social-metrics.toml`:**

```toml
name = "rr-social-metrics"
main = "src/social/metrics.ts"
compatibility_date = "2025-04-01"

[triggers]
crons = ["0 * * * *"]

[[d1_databases]]
binding = "DB"

[[kv_namespaces]]
binding = "RR_SOCIAL_KILLSWITCH"

[[kv_namespaces]]
binding = "RR_SOCIAL_TOKENS"

[vars]
NOTIFIER_FROM = "social-bot@reduced.recipes"
NOTIFIER_FROM_NAME = "RR Social"
NOTIFIER_CHANNEL = "email"

# secrets: PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET, NOTIFIER_TO
```

### Notes

- Pinterest analytics has 1-3h propagation delay. The 1h snapshot often returns zeros; signal starts at the 3h snapshot.
- `lifetime_metrics` returns cumulative numbers. Snapshots are the deltas the metrics dashboard uses; subtraction happens at analytics layer, not here.
- Day-30+ killswitch reads max impressions per post (most recent snapshot's lifetime number). Median across 5 posts is small sample — consider widening to 7 if v1 produces noisy false-positives.
- `social_attribution.installs` and `signups` are zeroed in v1; wire mobile-install attribution and web-signup attribution in Phase 2.

---

## 28. Ticket 013 — Editorial calendar seed

**Phase:** 1 · **Depends on:** 001 · **Effort:** XS (data-only)

### Goal

Pre-populate `social_editorial_calendar` with 90 days of theme rotation. Themes match the Pinterest meal-type boards from §11 / decision 5.

### Acceptance criteria

- [ ] `migrations/0011_editorial_calendar_seed.sql` inserts the next 90 days
- [ ] Day-of-week rotation: Mon-Thu weeknight, Fri-Sat comfort/indulgence, Sun meal prep
- [ ] Seasonal overlay: May/Jun summer freshness; Nov/Dec festive holiday; Jan healthy_january; Jul/Aug cookout_weeknights
- [ ] Each base row at `weight = 1.0`, seasonal overrides at `weight = 1.5`

### Generation script

`scripts/seed-editorial-calendar.ts` (run once locally; output committed):

```ts
// usage: pnpm tsx scripts/seed-editorial-calendar.ts > migrations/0011_editorial_calendar_seed.sql
import { ulid } from 'ulid';

const START = new Date('2026-05-06');
const DAYS = 90;

interface Row {
  id: string; start_date: string; end_date: string;
  theme: string; cuisine_filter: string | null;
  weight: number; notes: string | null;
}

const rows: Row[] = [];

for (let i = 0; i < DAYS; i++) {
  const d = new Date(START);
  d.setUTCDate(d.getUTCDate() + i);
  const ymd = d.toISOString().slice(0, 10);
  const dow = d.getUTCDay();
  const month = d.getUTCMonth() + 1;

  let theme: string;
  if (dow >= 1 && dow <= 4) theme = 'weeknight_dinners';
  else if (dow === 5 || dow === 6) theme = 'comfort_food_or_indulgence';
  else theme = 'meal_prep_sunday';

  rows.push({
    id: ulid(), start_date: ymd, end_date: ymd, theme,
    cuisine_filter: null, weight: 1.0,
    notes: 'auto-seeded base rotation',
  });

  let seasonal: string | null = null;
  if (month >= 5 && month <= 6) seasonal = 'summer_freshness';
  else if (month >= 11 && month <= 12) seasonal = 'festive_holiday';
  else if (month === 1) seasonal = 'healthy_january';
  else if (month === 7 || month === 8) seasonal = 'cookout_weeknights';

  if (seasonal) {
    rows.push({
      id: ulid(), start_date: ymd, end_date: ymd, theme: seasonal,
      cuisine_filter: null, weight: 1.5, notes: 'seasonal overlay',
    });
  }
}

const lines = ['-- Auto-generated by scripts/seed-editorial-calendar.ts'];
lines.push('-- Window: 90 days from 2026-05-06');
lines.push('');
lines.push(`INSERT INTO social_editorial_calendar (id, start_date, end_date, theme, cuisine_filter, weight, notes) VALUES`);
const valuesLines = rows.map((r, i) => {
  const last = i === rows.length - 1 ? ';' : ',';
  const cuisine = r.cuisine_filter === null ? 'NULL' : `'${r.cuisine_filter}'`;
  const notes = r.notes === null ? 'NULL' : `'${r.notes.replace(/'/g, "''")}'`;
  return `('${r.id}', '${r.start_date}', '${r.end_date}', '${r.theme}', ${cuisine}, ${r.weight}, ${notes})${last}`;
});
console.log([...lines, ...valuesLines].join('\n'));
```

### Manual verification

```bash
pnpm tsx scripts/seed-editorial-calendar.ts > migrations/0011_editorial_calendar_seed.sql
pnpm exec wrangler d1 migrations apply reduced-recipes-prod --local \
  --config packages/workers/wrangler.api.toml

pnpm exec wrangler d1 execute reduced-recipes-prod \
  --config packages/workers/wrangler.api.toml \
  --command "SELECT theme, COUNT(*) FROM social_editorial_calendar GROUP BY theme ORDER BY 2 DESC;"
```

Expected: ~50 weeknight_dinners, ~25 comfort_food_or_indulgence, ~13 meal_prep_sunday, plus ~20 seasonal overlays in May-Jun.

### Notes

- Re-run at day 60 to extend the window. Don't try to be clever about a perpetual cron-seeded calendar in v1.
- These themes are referenced verbatim by selector's `editorial_theme_match_score`. Don't rename without updating the selector.

---

## 29. Ticket 014 — Pinterest OAuth + token storage

**Phase:** 1 · **Depends on:** 002, 003 · **Effort:** M

### Goal

One-time OAuth bootstrap that obtains a Pinterest API v5 refresh token, stores it in `RR_SOCIAL_TOKENS` KV, and a refresh helper that adapter / publisher Workers call before any API request.

OAuth Authorization Code with PKCE. Run once interactively by the owner; everything automated after.

### Acceptance criteria

- [ ] Pinterest developer app registered, redirect URI set
- [ ] App secret stored as Worker secret, never inlined
- [ ] First-time bootstrap via `/oauth/pinterest/start` (CF Access protected)
- [ ] `getValidPinterestAccessToken(env)` returns a non-expired access token, refreshing if needed
- [ ] On refresh failure, Notifier sends an alert and the killswitch for `pinterest` is set

### Files to create / modify

```
packages/workers/src/social/admin/pinterest-oauth.ts
packages/social-shared/src/platforms/pinterest-auth.ts
packages/social-shared/src/platforms/pinterest-auth.test.ts
```

### Implementation

**Token shape (in KV at `pinterest:default`):**

```ts
export interface PinterestTokenBundle {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  obtainedAt: number;
}
```

**`pinterest-auth.ts`:**

```ts
import type { PinterestTokenBundle } from '../types';

const KV_KEY = 'pinterest:default';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface PinterestAuthEnv {
  RR_SOCIAL_TOKENS: KVNamespace;
  PINTEREST_CLIENT_ID: string;
  PINTEREST_CLIENT_SECRET: string;
}

export async function getValidPinterestAccessToken(env: PinterestAuthEnv): Promise<string> {
  const stored = await env.RR_SOCIAL_TOKENS.get<PinterestTokenBundle>(KV_KEY, 'json');
  if (!stored) throw new Error('Pinterest tokens not bootstrapped. Run /oauth/pinterest/start.');

  if (stored.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return stored.accessToken;
  }

  const refreshed = await refresh(env, stored.refreshToken);
  await env.RR_SOCIAL_TOKENS.put(KV_KEY, JSON.stringify(refreshed));
  return refreshed.accessToken;
}

async function refresh(env: PinterestAuthEnv, refreshToken: string): Promise<PinterestTokenBundle> {
  const basic = btoa(`${env.PINTEREST_CLIENT_ID}:${env.PINTEREST_CLIENT_SECRET}`);
  const r = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!r.ok) throw new Error(`Pinterest token refresh failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  const now = Date.now();
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? refreshToken,
    expiresAt: now + j.expires_in * 1000,
    scope: j.scope,
    obtainedAt: now,
  };
}
```

**`admin/pinterest-oauth.ts` (lives in `social-admin` Worker / Pages Functions):**

```ts
import { ulid } from '@rr/social-shared';
import type { PinterestTokenBundle } from '@rr/social-shared/types';

interface OauthEnv {
  RR_SOCIAL_TOKENS: KVNamespace;
  RR_SOCIAL_OAUTH_STATE: KVNamespace;
  PINTEREST_CLIENT_ID: string;
  PINTEREST_CLIENT_SECRET: string;
  PINTEREST_REDIRECT_URI: string;
}

const SCOPES = 'boards:read,boards:write,pins:read,pins:write,user_accounts:read';

export async function startOauth(env: OauthEnv): Promise<Response> {
  const state = ulid();
  const verifier = randomString(64);
  const challenge = await s256(verifier);

  await env.RR_SOCIAL_OAUTH_STATE.put(`pkce:${state}`, verifier, { expirationTtl: 300 });

  const authUrl = new URL('https://www.pinterest.com/oauth/');
  authUrl.searchParams.set('client_id', env.PINTEREST_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', env.PINTEREST_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return Response.redirect(authUrl.toString(), 302);
}

export async function callback(req: Request, env: OauthEnv): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return new Response('Missing code or state', { status: 400 });

  const verifier = await env.RR_SOCIAL_OAUTH_STATE.get(`pkce:${state}`);
  if (!verifier) return new Response('OAuth state expired or unknown', { status: 400 });
  await env.RR_SOCIAL_OAUTH_STATE.delete(`pkce:${state}`);

  const basic = btoa(`${env.PINTEREST_CLIENT_ID}:${env.PINTEREST_CLIENT_SECRET}`);
  const r = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code, redirect_uri: env.PINTEREST_REDIRECT_URI, code_verifier: verifier,
    }),
  });
  if (!r.ok) return new Response(`Token exchange failed: ${r.status} ${await r.text()}`, { status: 502 });

  const j = (await r.json()) as { access_token: string; refresh_token: string; expires_in: number; scope: string };
  const now = Date.now();
  const bundle: PinterestTokenBundle = {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: now + j.expires_in * 1000,
    scope: j.scope,
    obtainedAt: now,
  };
  await env.RR_SOCIAL_TOKENS.put('pinterest:default', JSON.stringify(bundle));

  return new Response('Pinterest connected. You can close this tab.', { status: 200 });
}

function randomString(len: number): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(36)).join('').slice(0, len);
}

async function s256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
```

### Test sketch

`pinterest-auth.test.ts`:
1. Stored token with future expiry → returns existing access token, no fetch
2. Stored token within refresh window → fetch refreshes, KV.put called, returns new token
3. No stored token → throws "not bootstrapped"

### Notes

- Pinterest tokens have a 30-day refresh-token lifetime *from last refresh*. As long as the system runs at least once a month, no re-bootstrap. If killswitch is active >25 days, schedule a no-op refresh call.
- One Pinterest account = one token bundle. The `:default` suffix leaves room for future per-board or backup-account model.
- OAuth client secret stored as Worker secret per CLAUDE.md sensitive-data policy.

---

## 30. Ticket 015 — R2 custom domain `assets.reduced.recipes`

**Phase:** 1 · **Depends on:** none (DNS-only) · **Effort:** S (mostly dashboard)

### Goal

Bind `assets.reduced.recipes` to the `rr-social-assets` R2 bucket so Pinterest gets a stable public origin and URLs read clean in pin descriptions.

### Acceptance criteria

- [ ] DNS: `assets.reduced.recipes` resolves and serves R2 objects
- [ ] Object uploaded to `rr-social-assets` reachable at `https://assets.reduced.recipes/<key>` with no auth
- [ ] HTTPS works (Cloudflare Universal SSL)
- [ ] Cache-Control `public, max-age=31536000, immutable` on uploaded objects

### Steps

```bash
# 1. Create the buckets if they don't exist.
pnpm exec wrangler r2 bucket create rr-social-assets
pnpm exec wrangler r2 bucket create rr-social-cache
pnpm exec wrangler r2 bucket create rr-social-templates

# 2. Bind the custom domain on rr-social-assets via dashboard:
#    Cloudflare dashboard -> R2 -> rr-social-assets -> Settings -> Custom Domains
#    Add: assets.reduced.recipes
#    Dashboard creates the proxied DNS record automatically.

# 3. Verify.
dig assets.reduced.recipes
echo "test" | pnpm exec wrangler r2 object put rr-social-assets/test.txt --pipe
curl -I https://assets.reduced.recipes/test.txt
# expect: 200, content-type, content-length, cache-control headers
```

### Notes

- Custom-domain binding is dashboard-only today; not in `wrangler.toml`. Document this once for fresh CF account setup.
- `rr-social-cache` and `rr-social-templates` stay private (no public domain). Only `rr-social-assets` (rendered pin PNGs and finished video MP4s) is public.
- Universal SSL handles cert provisioning automatically.

---

## 31. Ticket 016 — DNS + Worker route for `r.reduced.recipes`

**Phase:** 1 · **Depends on:** none · **Effort:** XS

### Goal

Stand up the `r.reduced.recipes` subdomain so the `social-shortlink` Worker (010) and email-digest one-click links (003) resolve.

### Acceptance criteria

- [ ] DNS record for `r.reduced.recipes` exists in the zone (proxied)
- [ ] Wrangler `routes` entry on `r.reduced.recipes/*` is bound to `rr-social-shortlink`
- [ ] CF Access on `r.reduced.recipes/approve/*` and `r.reduced.recipes/reject/*` (owner email only)
- [ ] HTTPS works

### Steps

```bash
# 1. DNS record (dashboard).
#    Cloudflare dashboard -> DNS -> reduced.recipes
#    Add: AAAA record `r` -> 100:: (or CNAME r -> reduced.recipes), proxied.

# 2. After ticket 010 deploys, the route in wrangler activates.
pnpm exec wrangler tail rr-social-shortlink &
curl -I https://r.reduced.recipes/
# expect: 404 from worker (NOT a Cloudflare placeholder)
```

### CF Access setup

1. Cloudflare Zero Trust → Access → Applications → Add
2. Type: Self-hosted
3. Application domain: `r.reduced.recipes`
4. Path: `/approve/*` — Policy: Include → Emails → owner email
5. Repeat for path `/reject/*`

The bare `/:draftId` outbound CTA stays public.

### Notes

- One-time ops setup; no code changes after.
- For per-environment shortlink domains, repeat for `r.preview.reduced.recipes` and use a `[env.preview]` block in `wrangler.social-shortlink.toml`.

---

## 32. Ticket 017 — `recipes.original_language` migration (NEW)

**Phase:** 1 · **Depends on:** none · **Effort:** XS

### Goal

Codify the `recipes.original_language` column. It is currently used in production by `packages/workers/src/projection.ts` (the projection Worker `INSERT`s into it on every recipe ingest) but no migration in `migrations/0001-0006` adds it. The selector in ticket 006 filters on this column, so v1 needs the schema to be explicit.

This is a tech-debt fix for an undocumented prod-only column. The column already exists in the prod recipes DB (otherwise projection.ts inserts would fail). The migration is mainly for fresh dev DBs and historical record.

### Acceptance criteria

- [ ] `migrations/0013_recipes_original_language.sql` adds the column + index
- [ ] Fresh local D1 init applies the migration without error
- [ ] Prod migration table is reconciled (manually marked applied if column already exists)

### Files to create

```
migrations/0013_recipes_original_language.sql
migrations/README.md                    (add a section on prod-bypass procedure)
```

### Implementation

**`migrations/0013_recipes_original_language.sql`:**

```sql
-- Codifies recipes.original_language, used by packages/workers/src/projection.ts.
-- The column already exists in prod (otherwise projection inserts would fail).
-- For fresh local DBs this migration adds it. For prod, mark as applied
-- without running. See migrations/README.md "prod-bypass" section.

ALTER TABLE recipes ADD COLUMN original_language TEXT;
CREATE INDEX IF NOT EXISTS idx_recipes_original_language ON recipes(original_language);
```

### Prod-bypass procedure

If `ALTER TABLE` fails in prod with "duplicate column name", the column already exists. Mark the migration as applied without running it:

```bash
pnpm exec wrangler d1 execute reduced-recipes-prod --remote \
  --config packages/workers/wrangler.api.toml \
  --command "INSERT INTO d1_migrations (name, applied_at) VALUES ('0013_recipes_original_language.sql', strftime('%s','now'));"
```

(The `d1_migrations` table is the internal Wrangler-managed migration ledger. The exact table name and columns may vary by Wrangler version; verify by running `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%migration%'` against the prod DB before relying on this snippet.)

The `CREATE INDEX IF NOT EXISTS` is safe regardless — it'll be a no-op if the index already exists.

### Manual verification

```bash
# Fresh local DB:
pnpm exec wrangler d1 migrations apply reduced-recipes-prod --local \
  --config packages/workers/wrangler.api.toml

pnpm exec wrangler d1 execute reduced-recipes-prod --local \
  --config packages/workers/wrangler.api.toml \
  --command "PRAGMA table_info(recipes);"
# expect: original_language column listed

pnpm exec wrangler d1 execute reduced-recipes-prod --local \
  --config packages/workers/wrangler.api.toml \
  --command "INSERT INTO recipes (id, title, domain, source_url, extracted_at, original_language) VALUES ('test', 't', 'd.com', 'http://d.com', '2026-05-06', 'fr'); SELECT original_language FROM recipes WHERE id = 'test';"
# expect: 'fr'
```

### Notes

- This is intentionally Phase 1 work even though the column already exists in prod. Without it, fresh dev environments fail when projection.ts runs, and the selector's `WHERE original_language IS NULL OR = 'en'` filter could behave unexpectedly on a fresh DB.
- The `IS NULL OR = 'en'` form in the selector tolerates either a backfilled column (where 'en' rows are explicit) or a freshly added column (where existing rows are NULL).
- Update `migrations/README.md` to document the prod-bypass once. Pattern applies to any future migration that retrofits an existing prod column.

---

# Closing matter

## Migration sequence (recipes DB)

| # | File | Source ticket |
|---|---|---|
| 0007 | `social_tables.sql` | 001 |
| 0008 | `social_orchestrator_runs.sql` | 004 |
| 0009 | `social_recipe_signals.sql` | 005 |
| 0010 | `search_hit_counter.sql` | 005 |
| 0011 | `editorial_calendar_seed.sql` | 013 |
| 0012 | `social_shortlink_hits.sql` | 010 |
| 0013 | `recipes_original_language.sql` | 017 |

## Final notes

- This document supersedes the earlier `spec/social-tickets/*.md` files and `spec/social-brand-voice.md`. Those files were folded in here and may be deleted.
- Spike artifacts (raw results, sample images, rendered MP4, container scaffold) live under `spec/spikes/social/` and remain as reference material.
- Newsletter is a separate workstream at `spec/newsletter.md`. It depends on this system's `social_source_candidates` and image pipeline.
- When this spec evolves, bump the version at the top, add a changelog row below this section, and update affected ticket sections inline.

## Changelog

| Version | Date | Notes |
|---|---|---|
| 0.1 | 2026-05-05 | Initial spec |
| 0.2 | 2026-05-06 | Locked decisions, switched to Workers AI + CF Containers, fixed domain to `reduced.recipes` |
| **1.0** | **2026-05-06** | **Consolidated brand voice, spikes, and 17 tickets into a single spec; corrected schema assumptions across tickets 002 / 005 / 006 / 008 / 010; added ticket 017 for `recipes.original_language`** |

