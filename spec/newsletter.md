# ReducedRecipes — Newsletter System

**Version:** 0.1
**Date:** 2026-05-06
**Owner:** Jannik
**Stack:** Cloudflare-native: Workers + D1 + KV + R2, MailChannels for sending, pnpm monorepo
**Operating model:** Weekly digest, generated Sunday morning, sent automatically; double opt-in for new subscribers
**Budget ceiling:** $20/mo additional infra
**Primary KPI:** Weekly active subscribers + click-through to recipe pages
**Reuses from:** the social automation system in `spec/social.md` (selector signals, image-gen pipeline, brand voice, Workers AI Llama for any caption rewriting)

---

## 1. Goals & non-goals

### Goals

- Own an audience independently of Pinterest / TikTok / Meta algorithms
- Ship a low-effort weekly cadence that drives recipe-page sessions and (eventually) mobile installs
- Stay legally clean: double opt-in, easy unsubscribe, pause-for-a-month option
- Reuse the social generation pipeline so newsletter content costs ~$0 marginal beyond send fees
- Hit 1,000 confirmed subscribers within 90 days of launch

### Non-goals

- **Personalisation in v1.** Everyone gets the same digest. Bookmark- or preference-based filtering waits for v2 once we have engagement data.
- **Daily cadence.** Considered and dropped: high unsubscribe risk for lifestyle email.
- **Inbound replies / community.** v1 sends only; replies bounce to a no-reply address.
- **Paid newsletter tier.** Project is not-for-profit. Future monetisation is Ko-fi mention in the email footer at most.
- **Standalone editorial team / hand-curated digests.** Generation reuses social signals; humans only override exceptions.

---

## 2. Architecture

### 2.1 System overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                  WEEKLY CRON (Sunday 14:00 UTC = 09:00 ET)           │
│  Worker: rr-newsletter-orchestrator                                  │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     1. CONTENT SELECTION                             │
│  Worker: rr-newsletter-selector                                      │
│  - Pulls candidates from social_source_candidates (last 7 days)      │
│  - Prefers ones that hit Pinterest with strong saves                 │
│  - Picks 1 hero + 5 supporting recipes                               │
│  - Reuses hero images already in rr-social-assets                    │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     2. EMAIL COMPOSITION                             │
│  Worker: rr-newsletter-composer                                      │
│  - Builds HTML + plain-text email bodies                             │
│  - Inlines critical CSS, copies hero images via assets.reduced.recipes│
│  - Embeds tracking pixel + UTM-tagged shortlinks                     │
│  - Stores composed email in newsletter_emails table                  │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     3. SEND                                          │
│  Worker: rr-newsletter-sender                                        │
│  - Iterates active subscribers (status='confirmed', not paused)      │
│  - Sends via MailChannels with personalised unsubscribe token        │
│  - Throttled to stay inside MailChannels rate limits                 │
│  - Records send result + open/click pixel hits                       │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     4. SIGNUP + LIFECYCLE                            │
│  Worker: rr-newsletter-signup (always-on HTTP)                       │
│  - POST /subscribe          (signup form submit)                     │
│  - GET  /confirm?token=...  (double opt-in confirmation)             │
│  - GET  /unsubscribe?...    (one-click unsubscribe)                  │
│  - GET  /pause?...&weeks=4  (pause for N weeks)                      │
│  - Pages embed: signup widget on web + mobile settings               │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Monorepo placement

```
reducedrecipes/                              (existing)
├── apps/
│   ├── frontend/                            (existing — add signup widget)
│   ├── mobile/                              (existing — add settings entry)
│   └── social-admin/                        (existing — add subscriber count widget)
├── workers/
│   ├── newsletter-orchestrator/             (NEW: weekly cron)
│   ├── newsletter-selector/                 (NEW)
│   ├── newsletter-composer/                 (NEW)
│   ├── newsletter-sender/                   (NEW)
│   └── newsletter-signup/                   (NEW: always-on HTTP)
└── packages/
    ├── newsletter-shared/                   (NEW: types, email-template helpers, token signing)
    └── notifier/                            (existing — reused for ops alerts)
```

---

## 3. Data model (D1)

All newsletter tables live in the `reduced-recipes-prod` recipes DB so they can FK to `recipes(id)` and reuse `social_source_candidates`.

### 3.1 New tables

```sql
-- Subscribers and lifecycle state.
CREATE TABLE newsletter_subscribers (
  id                TEXT PRIMARY KEY,                 -- ULID
  email             TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL,                    -- 'pending_confirmation' | 'confirmed' | 'paused' | 'unsubscribed' | 'bounced'
  confirm_token     TEXT,                             -- random 32-byte hex; nulled after confirm
  confirm_token_expires_at INTEGER,                   -- unix ms
  confirmed_at      INTEGER,
  paused_until      INTEGER,                          -- unix ms; resume sends when now > this
  unsubscribed_at   INTEGER,
  source            TEXT,                             -- 'recipe_page' | 'recipe_footer' | 'mobile_settings' | 'social_cta' | 'admin'
  created_at        INTEGER NOT NULL,
  last_sent_at      INTEGER,                          -- unix ms of most recent successful send
  consecutive_bounces INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_subs_status ON newsletter_subscribers(status);
CREATE INDEX idx_subs_email ON newsletter_subscribers(email);

-- Each weekly issue. One row per Sunday send batch.
CREATE TABLE newsletter_issues (
  id                TEXT PRIMARY KEY,                 -- ULID
  issue_date        TEXT NOT NULL UNIQUE,             -- YYYY-MM-DD of send Sunday
  hero_recipe_id    TEXT NOT NULL,
  supporting_recipe_ids TEXT NOT NULL,                -- JSON array of recipe ids
  subject_line      TEXT NOT NULL,
  preheader         TEXT NOT NULL,
  html_body_r2_key  TEXT NOT NULL,                    -- pre-composed; stored once, reused per recipient with token substitution
  text_body_r2_key  TEXT NOT NULL,
  status            TEXT NOT NULL,                    -- 'drafted' | 'sending' | 'sent' | 'failed'
  composed_at       INTEGER NOT NULL,
  sent_at           INTEGER,
  recipient_count   INTEGER,
  error             TEXT,
  FOREIGN KEY (hero_recipe_id) REFERENCES recipes(id)
);

-- Per-(issue, subscriber) send + engagement record.
CREATE TABLE newsletter_sends (
  id                TEXT PRIMARY KEY,                 -- ULID
  issue_id          TEXT NOT NULL,
  subscriber_id     TEXT NOT NULL,
  sent_at           INTEGER NOT NULL,
  open_at           INTEGER,                          -- via tracking pixel
  first_click_at    INTEGER,                          -- via tracked link
  click_count       INTEGER NOT NULL DEFAULT 0,
  bounce_at         INTEGER,
  bounce_reason     TEXT,
  FOREIGN KEY (issue_id) REFERENCES newsletter_issues(id),
  FOREIGN KEY (subscriber_id) REFERENCES newsletter_subscribers(id),
  UNIQUE (issue_id, subscriber_id)
);
CREATE INDEX idx_sends_issue ON newsletter_sends(issue_id);
CREATE INDEX idx_sends_subscriber ON newsletter_sends(subscriber_id);
```

### 3.2 KV namespaces

| Namespace | Purpose | TTL |
|-----------|---------|-----|
| `RR_NEWSLETTER_TOKENS` | Signed unsubscribe / pause / confirm tokens (HMAC; KV stores invalidations only) | none |
| `RR_NEWSLETTER_RATELIMIT` | Per-IP rate limit on `/subscribe` | 24h |

### 3.3 R2 buckets

| Bucket | Purpose |
|--------|---------|
| `rr-newsletter-issues` | Composed HTML + plain-text email bodies, one of each per issue |
| `rr-social-assets` | (existing) hero images served via `assets.reduced.recipes` |

---

## 4. Content selection

### 4.1 Selector logic (Sunday 14:00 UTC)

```
candidate_pool = social_source_candidates
                 WHERE selected_at >= now - 7 days

For each candidate, compute:
  pinterest_performance = saves_24h + 0.5 * impressions_normalised
                          (from social_metrics_snapshots, falls back to 0 if not yet snapshotted)
  freshness = 1.0 if not used in any of the last 4 newsletter_issues else 0
  diversity = 1.0 if cuisine differs from already-picked candidates this issue else 0.4

score = 0.5 * pinterest_performance + 0.3 * freshness + 0.2 * diversity
```

Pick: 1 hero (top score) + 5 supporting (top remaining 5, with the diversity penalty).

If fewer than 6 candidates exist (low-traffic week), pad from the corpus by hot_score (existing column on `recipes`).

### 4.2 Hero image strategy

Reuse the AI hero image already generated for the Pinterest pin (`rr-social-assets/drafts/<draftId>/hero.png`). No new generation for v1, no marginal cost. Newsletter inherits the same quality limits as the Pinterest pin (Spike B: occasional food-correctness errors). Mitigation: human can swap a hero from the admin UI before send (extension to the admin app, deferred to Phase 1.5).

If a candidate has no hero image yet (e.g. it scored high but was rejected at swipe and never published), generate on demand via the existing `social-image-gen` Worker.

### 4.3 Subject line + preheader

Generated by Workers AI Llama 3.3 70B using the brand voice from `spec/social-brand-voice.md`. Prompt produces strict JSON: `{ subject_line, preheader }`. Subject line ≤50 chars; preheader ≤90 chars.

Tone: same as Pinterest pin titles. "Five recipes for the week of May 12" rather than "🌟 Your AMAZING weekly recipes are HERE 🌟".

---

## 5. Email composition

### 5.1 Template

Single HTML template parameterised by:

- `subjectLine`, `preheader`
- `heroRecipe`: `{ title, time, imageUrl, recipeUrl }`
- `supportingRecipes`: array of `{ title, time, imageUrl, recipeUrl }` (length 5)
- `unsubscribeUrl`, `pauseUrl` (per-subscriber, signed token in URL)
- `trackingPixelUrl` (per-(issue, subscriber))

Rendered server-side by `newsletter-composer` Worker. Output stored once per issue with `{{TOKEN}}` placeholders for per-subscriber values; `newsletter-sender` substitutes at send time. This keeps the per-subscriber rendering cost ~zero.

### 5.2 Plain-text variant

Required (deliverability + accessibility). Auto-generated from the same input data. Plain links, no styling, same content order.

### 5.3 Critical CSS inlined

Emails strip `<style>` tags; styles must be inline. Use a small inliner step in the composer Worker (e.g. `juice` is heavy for Workers; instead, hand-write the template with inline styles since it's a single layout).

### 5.4 Cross-promotion (optional, low-volume)

Footer of every issue includes:

- Soft ask: "Forward this to a friend who hates story-scrolling."
- Pinterest CTA: "Browse this week's pins on Pinterest" (link to a meal-type board, rotated weekly).
- Ko-fi mention: small link, not a heavy ask.

Pinterest pins reciprocate with an optional CTA append: "Or get five new recipes every Sunday: reduced.recipes/newsletter". Off by default; adapter prompt template controls the toggle.

---

## 6. Signup + lifecycle

### 6.1 Signup widget

Three placement surfaces in v1:

| Surface | Where | Trigger |
|---|---|---|
| End-of-recipe inline | `apps/frontend` recipe page bottom | Always rendered when scrolled past last instruction |
| Recipe page footer | `apps/frontend` site-wide footer | Always rendered |
| Mobile settings | `apps/mobile` settings screen | Always rendered |

Web component: `<NewsletterSignup variant="inline" | "footer" />`. Mobile: list row in settings.

Form: single email input + submit. On submit, POST to `/subscribe` (newsletter-signup Worker).

### 6.2 Double opt-in flow

```
User submits email
  ↓
POST /subscribe { email, source }
  - Validate email format
  - Insert subscriber with status='pending_confirmation', random confirm_token
  - Send confirmation email via MailChannels: "Confirm your subscription"
  - Show in-page confirmation: "Check your email to confirm."
  ↓
User clicks confirm link
  ↓
GET /confirm?token=<hex>
  - Look up subscriber by token
  - If found and not expired (24h window): set status='confirmed', confirmed_at=now, null the token
  - Show landing page: "You're in. First Sunday digest in <N> days."
```

If the user re-submits while already `pending_confirmation`, regenerate the token and resend (rate-limited to once per 5 minutes per email).

If the user re-submits while `confirmed`, no-op with a friendly "you're already in" message.

### 6.3 Unsubscribe + pause

Every email contains:

- **Unsubscribe link:** signed HMAC token with `subscriber_id`. `GET /unsubscribe?token=...` flips status to `unsubscribed`. One-click, no confirmation page (CAN-SPAM requires this).
- **Pause link:** `GET /pause?token=...&weeks=4`. Sets `paused_until` to `now + 4 weeks`. The sender skips paused subscribers; pause auto-expires.

### 6.4 Bounce handling

MailChannels surfaces hard / soft bounces in their delivery webhook. If we don't wire that up in v1, fall back to: increment `consecutive_bounces` per send error. After 3 consecutive, set status to `bounced`.

---

## 7. Sending infrastructure

### 7.1 MailChannels

Same provider as `EmailNotifier` from social ticket 003. Free tier covers our v1 volume (under 1,000 subscribers × 4 sends/month = 4,000 emails/month, well under MailChannels' free quota).

DKIM + SPF: use Cloudflare Email Routing's auto-DKIM on `reduced.recipes`. SPF TXT record covers MailChannels.

From: `recipes@reduced.recipes` (visible) with `Reply-To: no-reply@reduced.recipes`.

### 7.2 Send rate

MailChannels caps individual workers but the practical limit is well above our scale. Send sequentially in batches of 50, respecting the rate-limit response headers.

### 7.3 Sender Worker shape

```
1. Load issue (status='drafted')
2. Mark issue status='sending'
3. SELECT subscribers WHERE status='confirmed'
   AND (paused_until IS NULL OR paused_until <= now)
4. For each subscriber:
   a. Generate per-subscriber tokens (unsubscribe, pause)
   b. Substitute {{TOKEN}} placeholders in HTML/text bodies
   c. POST to MailChannels
   d. Insert newsletter_sends row
   e. Update subscriber.last_sent_at
5. Mark issue status='sent', set recipient_count
```

Run as a queue consumer rather than inline cron, so the orchestrator just enqueues per-subscriber send tasks. Lets us retry individual sends without re-rendering the issue.

---

## 8. Cost analysis

| Component | Tier | Cost |
|-----------|------|------|
| Workers (5 new) | Paid plan ($5/mo, already paid) | Marginal: ~$0 |
| D1 | Free tier | $0 |
| KV | Free tier | $0 |
| R2 storage | ~5 MB/issue × 52 issues = 260 MB/year | ~$0 |
| MailChannels | Free tier | $0 |
| Workers AI Llama (subject + preheader, weekly) | Free neuron allowance | $0 |
| Image gen | Reuses social hero images | $0 marginal |
| **Total recurring** | | **~$0/mo** |

The ~$20 budget headroom in §0 is reserved for:
- Custom domain on R2 if `assets.reduced.recipes` ever splits into a per-system layout
- Migration to a paid email provider if MailChannels' free tier changes
- Bounce-tracking webhook infrastructure if we add it

---

## 9. Build sequence

### Phase 1 — single weekly digest, no fancy UX (Weeks 1-3)

- [ ] D1 migrations: 3 newsletter tables
- [ ] `packages/newsletter-shared`: types, HMAC token helpers, email-template TSX
- [ ] `newsletter-signup` Worker: subscribe / confirm / unsubscribe / pause endpoints
- [ ] Frontend signup widget component (3 placements)
- [ ] Mobile settings entry
- [ ] `newsletter-orchestrator` cron Worker (Sundays 14:00 UTC)
- [ ] `newsletter-selector` Worker reading `social_source_candidates` + Pinterest metrics
- [ ] `newsletter-composer` Worker producing HTML + text, storing in R2
- [ ] `newsletter-sender` queue consumer
- [ ] First-issue manual trigger + dry-run mode
- [ ] Subscriber count widget on the social-admin Pages app

**Exit criteria:** 14 consecutive Sundays of automated sends to ≥10 confirmed subscribers (you, family, early friends), >40% open rate over the trailing 4 issues, <2% unsubscribe rate.

### Phase 2 — quality + engagement (post-launch, conditional)

- [ ] Open + click tracking surfaced in social-admin
- [ ] Bounce-tracking webhook from MailChannels
- [ ] Hero swap UI in admin (override AI image before send)
- [ ] Welcome email on confirm (single email, not a series in v2)
- [ ] Soft "you've missed N issues" reactivation email after 60 days inactive

### Phase 3 — personalisation

- [ ] Dietary-preference filtering (`USER_CACHE_KV`)
- [ ] Bookmark-driven recommendation overlay
- [ ] A/B subject lines per cohort

---

## 10. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Free-tier MailChannels tightens or removes the free abuse path | Medium | Switch sending provider | Sender Worker abstracts the provider; swap to Resend or Postmark in <1 day |
| Domain reputation tanks early due to cold-start sending | Low | Deliverability craters | Warm up: first 7 issues capped at 50 recipients each; SPF/DKIM/DMARC clean from day one |
| GDPR / CAN-SPAM violation | Low | Legal exposure | Double opt-in, one-click unsubscribe, store consent timestamp + source in `newsletter_subscribers` |
| Pinterest hero images turn out unusable for email (tracking-pixel domain blocked, image too large) | Low | Visual breakage | Resize to ≤200 KB at compose time; fallback to recipe page link without image |
| Subscriber list grows fast and exceeds MailChannels free tier | Medium-low | Forced migration | Provider abstraction in §7.1; budgeted in §8 headroom |
| AI subject lines produce spam-trigger phrases ("FREE", "AMAZING") | Low | Inbox-folder placement | Brand voice prompt explicitly bans these patterns; manual review on first 4 issues |
| Newsletter content mismatches Pinterest content (different recipes featured) | Low | Brand incoherence | Selector reuses `social_source_candidates`; same week's choices |
| User clicks unsubscribe in email, link is broken | Low | Compliance breach | Token-signing helper covered by unit tests; CAN-SPAM unsubscribe is the single most important link |

---

## 11. Decisions (locked 2026-05-06)

| # | Decision | Resolution |
|---|---|---|
| 1 | Cadence | **Weekly summary, Sundays 09:00 ET (14:00 UTC).** Daily was considered and dropped. |
| 2 | Generation source | **Reuses social pipeline.** Newsletter selector reads `social_source_candidates` from past 7 days. |
| 3 | Personalisation | **None for v1.** All subscribers get the same digest. |
| 4 | Compliance | **Double opt-in.** Confirmation email required; one-click unsubscribe in every send. |
| 5 | Signup surfaces | **Three:** end-of-recipe inline, recipe page footer, mobile settings screen. |
| 6 | Pause option | **Yes.** Every email has "pause for 4 weeks" alongside unsubscribe. |
| 7 | Hero images | **Reused from Pinterest pins.** No newsletter-specific image generation in v1. |
| 8 | Subject line generation | **Workers AI Llama 3.3 70B**, brand voice from `spec/social-brand-voice.md`. |
| 9 | Sending provider | **MailChannels**, swappable behind sender Worker. |
| 10 | Reply policy | **No-reply.** Replies bounce; community / inbound is out of scope. |

---

## 12. What this spec is **not** solving

- Personalisation of any kind (Phase 3)
- Inbound replies, community, "reply with what you cooked" (out of scope)
- Sponsorships, paid placements, affiliate links (not-for-profit posture stays)
- Transactional emails (welcome on signup is the only one in v1; reset / receipt flows handled elsewhere)
- Cross-language newsletters (English only, matches social v0.2)
- Mobile push notifications for "new issue out" (covered separately if `Notifier` swap to push happens)

---

**Next step:** brainstorm questions that scope the implementation tickets (depends-on chain to `spec/social.md` + 5-7 newsletter-specific tickets), then write tickets in `spec/newsletter-tickets/` mirroring the social structure.
