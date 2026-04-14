# ReducedRecipes — Full Product & Engineering Specification

**Domain:** reducedrecipes.com  
**Stack:** Cloudflare Workers · D1 · KV · Queues · R2 · Pages  
**Pattern:** KV as source of truth · D1 as disposable read model (CQRS)  
**Runtime:** TypeScript throughout  
**Package manager:** pnpm  
**Repo layout:** pnpm monorepo with three workspace packages — `@rr/shared`, `@rr/workers`, `@rr/frontend`  

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Architecture](#2-architecture)
3. [Data Model](#3-data-model)
4. [Cloudflare Resource Definitions](#4-cloudflare-resource-definitions)
5. [Worker: Orchestrator](#5-worker-orchestrator)
6. [Worker: Crawler](#6-worker-crawler)
7. [Worker: Parser](#7-worker-parser)
8. [Worker: Projection](#8-worker-projection)
9. [Worker: API](#9-worker-api)
10. [Frontend](#10-frontend)
11. [Search](#11-search)
12. [Robots.txt & Crawl Ethics](#12-robotstxt--crawl-ethics)
13. [Rate Limiting](#13-rate-limiting)
14. [D1 Rebuild Pipeline](#14-d1-rebuild-pipeline)
15. [Error Handling & Dead Letter Queue](#15-error-handling--dead-letter-queue)
16. [Monitoring & Observability](#16-monitoring--observability)
17. [Monorepo & Workspace Setup](#17-monorepo--workspace-setup)
18. [Project Structure](#18-project-structure)
19. [wrangler Configs](#19-wrangler-configs)
20. [Environment Variables & Secrets](#20-environment-variables--secrets)
21. [Deployment](#21-deployment)
22. [Seed Data](#22-seed-data)
23. [Cost Model](#23-cost-model)

---

## 1. Product Overview

ReducedRecipes is a recipe aggregation platform that strips away blog stories, life histories, and SEO filler — presenting only the recipe title, image, ingredients, and instructions. Every recipe links back prominently to the original author with a "View Full Recipe" CTA.

### Core User Value
- Find any recipe and see it immediately — no scrolling past 2,000 words of personal narrative
- Search and filter by ingredient, cuisine, cook time, and dietary tag
- Each recipe page is a clean, printable card

### Legal & Ethical Posture
- Respect `robots.txt` on every domain, no exceptions
- Hotlink images — never re-host without permission
- Credit author name and link prominently on every recipe card
- Offer opt-out via `hello@reducedrecipes.com` and a `/remove` form
- Structured data only — extract Schema.org `Recipe` blocks, never scrape prose

---

## 2. Architecture

### Write Path (Crawl → Store)

```
EventBridge Cron (hourly)
        │
        ▼
[Worker: Orchestrator]
  Queries D1 crawl_queue for URLs due
  Batch-sends to CRAWL_QUEUE
        │
        ▼
[Queue: crawl-jobs]
        │
        ▼
[Worker: Crawler]
  Checks robots.txt (KV-cached)
  Checks domain rate limit (KV token bucket)
  Fetches HTML via fetch()
  Sends {url, domain, html} to PARSE_QUEUE
  Updates crawl_queue status in D1
        │
        ▼
[Queue: parse-jobs]
        │
        ▼
[Worker: Parser]
  Extracts Schema.org ld+json Recipe block
  Falls back to recipe-scrapers heuristics
  Writes full JSON document to KV  ← SOURCE OF TRUTH
  Sends {id, doc} to PROJECTION_QUEUE
  Enqueues newly discovered recipe URLs back to crawl_queue
        │
        ▼
[Queue: projection-jobs]
        │
        ▼
[Worker: Projection]
  Writes lean metadata row to D1 recipes table
  Writes tag rows to D1 recipe_tags table
  Updates D1 FTS index via trigger
```

### Read Path (Serve → User)

```
User Request
        │
        ▼
[Cloudflare Pages + CDN Cache]
        │
  ┌─────┴──────┐
  │            │
Detail Page  List/Search Page
  │            │
  ▼            ▼
[Worker: API]  [Worker: API]
  │            │
  ▼            ▼
KV lookup    D1 query
(full doc)   (lean metadata)
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| KV as source of truth | Edge-speed detail page reads; schema-free; rebuildable |
| D1 as read model | SQL for lists, filters, FTS search; ~200B per row vs ~8KB in KV |
| Queues between workers | Decouples crawl rate from parse rate; automatic retry; DLQ |
| One item per Queue message | Workers stay within CPU time limits; clean retry semantics |
| Cloudflare Pages for frontend | Zero-config CDN; deploys from Git; free |

---

## 3. Data Model

### 3.1 KV Schema (Source of Truth)

**Namespace: `RECIPES_KV`**

| Key pattern | Value | TTL |
|---|---|---|
| `recipe:{uuid}` | Full RecipeDocument JSON | 1 year |
| `robots:{domain}` | `"true"` or `"false"` | 24 hours |
| `rl:{domain}:{window}` | `"1"` (rate limit slot) | 10 seconds |

#### RecipeDocument (TypeScript interface)

```typescript
interface RecipeDocument {
  id: string;                    // UUID v4
  source_url: string;            // Canonical URL of original recipe
  domain: string;                // e.g. "seriouseats.com"
  title: string;
  image_url: string | null;      // Hotlinked — not re-hosted
  author: string | null;
  yields: string | null;         // e.g. "4 servings"
  prep_time: number | null;      // minutes
  cook_time: number | null;      // minutes
  total_time: number | null;     // minutes
  ingredients: string[];         // ["200g spaghetti", "100g guanciale"]
  instructions: string[];        // One sentence/step per element
  tags: string[];                // ["pasta", "italian", "dinner", "quick"]
  cuisine: string | null;
  category: string | null;       // "main course", "dessert", etc.
  keywords: string[];
  schema_valid: boolean;         // true if extracted from ld+json
  extracted_at: string;          // ISO 8601
  last_checked: string;          // ISO 8601
}
```

### 3.2 D1 Schema (Read Model)

D1 is **fully disposable** — it can always be rebuilt from KV. Never treat it as a source of truth.

```sql
-- ─────────────────────────────────────────────
-- Core recipe projection (lean — no blobs)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipes (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  domain       TEXT NOT NULL,
  source_url   TEXT NOT NULL,
  image_url    TEXT,
  author       TEXT,
  total_time   INTEGER,
  prep_time    INTEGER,
  cook_time    INTEGER,
  yields       TEXT,
  cuisine      TEXT,
  category     TEXT,
  schema_valid INTEGER DEFAULT 0,
  extracted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipes_domain      ON recipes(domain);
CREATE INDEX IF NOT EXISTS idx_recipes_total_time  ON recipes(total_time);
CREATE INDEX IF NOT EXISTS idx_recipes_extracted   ON recipes(extracted_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_cuisine     ON recipes(cuisine);

-- ─────────────────────────────────────────────
-- Tag normalisation table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag       TEXT NOT NULL,
  PRIMARY KEY (recipe_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_recipe_tags_tag ON recipe_tags(tag);

-- ─────────────────────────────────────────────
-- Crawl queue & scheduling
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crawl_queue (
  url          TEXT PRIMARY KEY,
  domain       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
    -- pending | crawling | done | failed | skipped
  priority     INTEGER NOT NULL DEFAULT 5,
    -- 1 = highest (manually added), 10 = lowest (auto-discovered)
  fail_count   INTEGER NOT NULL DEFAULT 0,
  last_crawled TEXT,
  next_crawl   TEXT NOT NULL DEFAULT (datetime('now')),
  added_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crawl_due    ON crawl_queue(status, next_crawl);
CREATE INDEX IF NOT EXISTS idx_crawl_domain ON crawl_queue(domain);

-- ─────────────────────────────────────────────
-- Domain registry (seed list + metadata)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS domains (
  domain          TEXT PRIMARY KEY,
  sitemap_url     TEXT,
  robots_txt      TEXT,
  crawl_delay_ms  INTEGER NOT NULL DEFAULT 3000,
  active          INTEGER NOT NULL DEFAULT 1,
  recipe_count    INTEGER NOT NULL DEFAULT 0,
  last_spidered   TEXT,
  added_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- FTS5 virtual table (title + tags + author)
-- ─────────────────────────────────────────────
CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(
  id       UNINDEXED,
  title,
  tags,
  author,
  cuisine,
  content  = recipes,
  content_rowid = rowid,
  tokenize = 'porter ascii'
);

-- Keep FTS in sync
CREATE TRIGGER IF NOT EXISTS recipes_ai AFTER INSERT ON recipes BEGIN
  INSERT INTO recipes_fts(rowid, id, title, tags, author, cuisine)
  SELECT new.rowid, new.id, new.title,
    COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM recipe_tags WHERE recipe_id = new.id), ''),
    new.author, new.cuisine;
END;

CREATE TRIGGER IF NOT EXISTS recipes_au AFTER UPDATE ON recipes BEGIN
  UPDATE recipes_fts SET
    title   = new.title,
    author  = new.author,
    cuisine = new.cuisine
  WHERE id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS recipes_ad AFTER DELETE ON recipes BEGIN
  DELETE FROM recipes_fts WHERE id = old.id;
END;
```

---

## 4. Cloudflare Resource Definitions

### Queues

| Queue name | Producer | Consumer | Max batch | Max retries | DLQ |
|---|---|---|---|---|---|
| `crawl-jobs` | Orchestrator | Crawler | 10 | 3 | `crawl-dlq` |
| `parse-jobs` | Crawler | Parser | 5 | 3 | `parse-dlq` |
| `projection-jobs` | Parser | Projection | 25 | 5 | `projection-dlq` |
| `crawl-dlq` | — | DLQ Worker | 10 | 0 | — |
| `parse-dlq` | — | DLQ Worker | 10 | 0 | — |
| `projection-dlq` | — | DLQ Worker | 10 | 0 | — |

### KV Namespaces

| Binding | Purpose |
|---|---|
| `RECIPES_KV` | Full recipe documents (source of truth) |
| `CACHE_KV` | robots.txt, rate limit tokens, misc cache |

### D1 Databases

| Binding | Database name |
|---|---|
| `DB` | `reduced-recipes-prod` |

### R2 Buckets (optional — for image caching)

| Binding | Bucket name | Purpose |
|---|---|---|
| `IMAGES_R2` | `rr-images` | Cached thumbnails (only when hotlinking is unavailable) |

---

## 5. Worker: Orchestrator

**Trigger:** Cron — `0 * * * *` (every hour)  
**File:** `src/workers/orchestrator.ts`

### Responsibilities
1. Query `crawl_queue` for URLs where `status = 'pending'` and `next_crawl <= now()`
2. Batch-send up to 500 URLs to `crawl-jobs` queue per run
3. Periodically ingest new sitemaps from the `domains` table
4. Mark sent URLs as `crawling` to prevent double-dispatch

### Logic

```typescript
export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    // 1. Pull due URLs, prioritised
    const due = await env.DB.prepare(`
      SELECT url, domain FROM crawl_queue
      WHERE status = 'pending' AND next_crawl <= datetime('now')
      ORDER BY priority ASC, next_crawl ASC
      LIMIT 500
    `).all<{ url: string; domain: string }>();

    if (!due.results.length) return;

    // 2. Mark as in-flight
    const urls = due.results.map(r => r.url);
    await env.DB.prepare(
      `UPDATE crawl_queue SET status = 'crawling'
       WHERE url IN (${urls.map(() => '?').join(',')})` 
    ).bind(...urls).run();

    // 3. Enqueue to crawl-jobs in batches of 100
    const batches = chunk(due.results, 100);
    for (const batch of batches) {
      await env.CRAWL_QUEUE.sendBatch(
        batch.map(row => ({
          body: row,
          contentType: 'json',
        }))
      );
    }

    // 4. Hourly: ingest one pending sitemap
    await ingestNextSitemap(env);
  }
};

async function ingestNextSitemap(env: Env) {
  const domain = await env.DB.prepare(`
    SELECT domain, sitemap_url FROM domains
    WHERE active = 1 AND (last_spidered IS NULL OR last_spidered < datetime('now', '-7 days'))
    ORDER BY last_spidered ASC NULLS FIRST
    LIMIT 1
  `).first<{ domain: string; sitemap_url: string }>();

  if (!domain?.sitemap_url) return;

  const urls = await parseSitemap(domain.sitemap_url);
  const recipeUrls = urls.filter(u => isRecipeUrl(u, domain.domain));

  // Upsert into crawl_queue — ignore existing
  const stmts = recipeUrls.map(url =>
    env.DB.prepare(`
      INSERT OR IGNORE INTO crawl_queue (url, domain, status, next_crawl)
      VALUES (?, ?, 'pending', datetime('now'))
    `).bind(url, domain.domain)
  );

  // D1 batch max is 100
  for (const chunk of chunks(stmts, 100)) {
    await env.DB.batch(chunk);
  }

  await env.DB.prepare(
    `UPDATE domains SET last_spidered = datetime('now') WHERE domain = ?`
  ).bind(domain.domain).run();
}
```

### URL Detection

```typescript
const RECIPE_PATH_SEGMENTS = [
  '/recipe/', '/recipes/', '/dish/', '/cook/',
  '/food/', '/cooking/', '/meal/'
];

function isRecipeUrl(url: string, domain: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== domain && !parsed.hostname.endsWith(`.${domain}`)) return false;
    return RECIPE_PATH_SEGMENTS.some(seg => parsed.pathname.includes(seg));
  } catch {
    return false;
  }
}
```

---

## 6. Worker: Crawler

**Trigger:** Queue consumer — `crawl-jobs`  
**File:** `src/workers/crawler.ts`  
**Max batch size:** 10  
**Max retries:** 3  

### Responsibilities
1. Check `robots.txt` for each URL (KV-cached 24h)
2. Enforce per-domain rate limit (KV token bucket, 1 req / `crawl_delay_ms`)
3. Fetch HTML with correct `User-Agent`
4. Send `{url, domain, html}` to `parse-jobs`
5. Update `crawl_queue` status on success or failure
6. Retry with exponential back-off on transient failures

### Logic

```typescript
export default {
  async queue(batch: MessageBatch<CrawlJob>, env: Env) {
    for (const msg of batch.messages) {
      const { url, domain } = msg.body;

      try {
        // ── robots.txt ──────────────────────────────────────────
        const robotsAllowed = await checkRobots(url, domain, env);
        if (!robotsAllowed) {
          await updateCrawlStatus(env, url, 'skipped');
          msg.ack();
          continue;
        }

        // ── rate limit ──────────────────────────────────────────
        const domainConfig = await env.DB.prepare(
          'SELECT crawl_delay_ms FROM domains WHERE domain = ?'
        ).bind(domain).first<{ crawl_delay_ms: number }>();

        const delayMs = domainConfig?.crawl_delay_ms ?? 3000;
        const windowKey = `rl:${domain}:${Math.floor(Date.now() / delayMs)}`;
        const slot = await env.CACHE_KV.get(windowKey);

        if (slot !== null) {
          // Rate limited — requeue with delay
          msg.retry({ delaySeconds: Math.ceil(delayMs / 1000) + 1 });
          continue;
        }

        await env.CACHE_KV.put(windowKey, '1', {
          expirationTtl: Math.ceil(delayMs / 1000) * 2
        });

        // ── fetch ───────────────────────────────────────────────
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'ReducedRecipesBot/1.0 (+https://reducedrecipes.com/bot)',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: AbortSignal.timeout(10_000),
          redirect: 'follow',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) {
          await updateCrawlStatus(env, url, 'skipped');
          msg.ack();
          continue;
        }

        const html = await response.text();

        // ── enqueue for parsing ─────────────────────────────────
        await env.PARSE_QUEUE.send({ url, domain, html }, { contentType: 'json' });
        await updateCrawlStatus(env, url, 'done');
        msg.ack();

      } catch (err) {
        const error = err as Error;
        const isTransient = isTransientError(error);

        await env.DB.prepare(`
          UPDATE crawl_queue
          SET
            fail_count = fail_count + 1,
            status = CASE
              WHEN fail_count + 1 >= 3 THEN 'failed'
              ELSE 'pending'
            END,
            next_crawl = datetime('now', '+' || (POWER(2, fail_count + 1) * 60) || ' seconds')
          WHERE url = ?
        `).bind(url).run();

        if (isTransient && msg.attempts < 3) {
          msg.retry({ delaySeconds: Math.pow(2, msg.attempts) * 30 });
        } else {
          msg.ack(); // DLQ handles permanent failures
        }
      }
    }
  }
};
```

### robots.txt Checker

```typescript
async function checkRobots(url: string, domain: string, env: Env): Promise<boolean> {
  const cacheKey = `robots:${domain}`;
  const cached = await env.CACHE_KV.get(cacheKey);

  if (cached !== null) return cached === 'true';

  try {
    const robotsUrl = `https://${domain}/robots.txt`;
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': 'ReducedRecipesBot/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // No robots.txt = allowed
      await env.CACHE_KV.put(cacheKey, 'true', { expirationTtl: 86400 });
      return true;
    }

    const text = await res.text();
    const allowed = parseRobots(text, url, 'ReducedRecipesBot');

    await env.CACHE_KV.put(cacheKey, String(allowed), { expirationTtl: 86400 });
    return allowed;

  } catch {
    // Network error fetching robots.txt — assume allowed, cache briefly
    await env.CACHE_KV.put(cacheKey, 'true', { expirationTtl: 3600 });
    return true;
  }
}

function parseRobots(robotsTxt: string, targetUrl: string, botName: string): boolean {
  const lines = robotsTxt.split('\n').map(l => l.trim());
  const path = new URL(targetUrl).pathname;

  let inRelevantBlock = false;
  let hasRelevantBlock = false;

  for (const line of lines) {
    if (line.toLowerCase().startsWith('user-agent:')) {
      const agent = line.split(':')[1].trim().toLowerCase();
      inRelevantBlock = agent === '*' || agent === botName.toLowerCase();
      if (inRelevantBlock) hasRelevantBlock = true;
    }

    if (!inRelevantBlock) continue;

    if (line.toLowerCase().startsWith('disallow:')) {
      const disallowed = line.split(':')[1].trim();
      if (disallowed && path.startsWith(disallowed)) return false;
    }
  }

  return true;
}
```

---

## 7. Worker: Parser

**Trigger:** Queue consumer — `parse-jobs`  
**File:** `src/workers/parser.ts`  
**Max batch size:** 5 (HTML payloads are large)  
**Max retries:** 3  

### Responsibilities
1. Extract `Recipe` from Schema.org `ld+json` blocks (primary strategy)
2. Fall back to heuristic HTML extraction if Schema.org unavailable
3. Normalise extracted data into `RecipeDocument` shape
4. Write full document to KV (source of truth)
5. Enqueue projection job to `projection-jobs`
6. Discover and enqueue new recipe URLs found on the page

### Schema.org Extraction

```typescript
function extractSchemaOrg(html: string): RawRecipe | null {
  // Match all ld+json script blocks
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);

      // Could be a single object or an array
      const candidates = Array.isArray(json) ? json : [json];

      for (const candidate of candidates) {
        // Handle @graph structure
        if (candidate['@graph']) {
          const recipe = candidate['@graph'].find(
            (n: any) => normaliseType(n['@type']) === 'recipe'
          );
          if (recipe) return recipe;
        }

        if (normaliseType(candidate['@type']) === 'recipe') {
          return candidate;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

function normaliseType(type: string | string[] | undefined): string {
  if (!type) return '';
  const t = Array.isArray(type) ? type[0] : type;
  return t.toLowerCase().replace('https://schema.org/', '').replace('http://schema.org/', '');
}
```

### Data Normalisation

```typescript
function normaliseRecipe(raw: any, sourceUrl: string): RecipeDocument {
  const id = crypto.randomUUID();

  return {
    id,
    source_url: sourceUrl,
    domain: new URL(sourceUrl).hostname.replace(/^www\./, ''),
    title: cleanText(raw.name ?? raw.headline ?? ''),
    image_url: extractImageUrl(raw.image),
    author: extractAuthor(raw.author),
    yields: cleanText(raw.recipeYield ?? raw.yield ?? null),
    prep_time: parseDuration(raw.prepTime),
    cook_time: parseDuration(raw.cookTime),
    total_time: parseDuration(raw.totalTime),
    ingredients: extractIngredients(raw.recipeIngredient),
    instructions: extractInstructions(raw.recipeInstructions),
    tags: extractTags(raw.keywords, raw.recipeCuisine, raw.recipeCategory),
    cuisine: cleanText(raw.recipeCuisine ?? null),
    category: cleanText(raw.recipeCategory ?? null),
    keywords: extractKeywords(raw.keywords),
    schema_valid: true,
    extracted_at: new Date().toISOString(),
    last_checked: new Date().toISOString(),
  };
}

// ISO 8601 duration → minutes
// PT1H30M → 90, PT45M → 45, P0D → 0
function parseDuration(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const match = duration.match(/PT?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return null;
  const hours = parseInt(match[1] ?? '0');
  const minutes = parseInt(match[2] ?? '0');
  return hours * 60 + minutes || null;
}

function extractInstructions(raw: any): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) {
    return raw.flatMap(step => {
      if (typeof step === 'string') return [cleanText(step)];
      if (step['@type'] === 'HowToStep') return [cleanText(step.text ?? step.name ?? '')];
      if (step['@type'] === 'HowToSection') return extractInstructions(step.itemListElement);
      return [];
    }).filter(Boolean);
  }
  return [];
}

function extractIngredients(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(i => cleanText(String(i))).filter(Boolean);
  return [];
}

function extractImageUrl(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return extractImageUrl(raw[0]);
  if (typeof raw === 'object') return raw.url ?? raw.contentUrl ?? null;
  return null;
}

function extractTags(keywords: any, cuisine: any, category: any): string[] {
  const tags = new Set<string>();
  if (typeof keywords === 'string') {
    keywords.split(',').map((k: string) => k.trim().toLowerCase()).forEach((t: string) => tags.add(t));
  }
  if (typeof cuisine === 'string') tags.add(cuisine.toLowerCase());
  if (Array.isArray(cuisine)) cuisine.forEach((c: string) => tags.add(c.toLowerCase()));
  if (typeof category === 'string') tags.add(category.toLowerCase());
  return [...tags].filter(Boolean);
}

function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')       // Strip HTML tags
    .replace(/\s+/g, ' ')          // Collapse whitespace
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
```

### Full Worker Handler

```typescript
export default {
  async queue(batch: MessageBatch<ParseJob>, env: Env) {
    for (const msg of batch.messages) {
      const { url, domain, html } = msg.body;

      try {
        // ── Extract ─────────────────────────────────────────────
        const rawSchema = extractSchemaOrg(html);

        if (!rawSchema) {
          // Flag for manual review — don't discard
          await env.DB.prepare(`
            UPDATE crawl_queue SET status = 'no_schema' WHERE url = ?
          `).bind(url).run();
          msg.ack();
          continue;
        }

        const recipe = normaliseRecipe(rawSchema, url);

        if (!recipe.title || recipe.ingredients.length === 0) {
          // Incomplete extraction — skip
          msg.ack();
          continue;
        }

        // ── Write to KV (source of truth) ───────────────────────
        await env.RECIPES_KV.put(
          `recipe:${recipe.id}`,
          JSON.stringify(recipe),
          { expirationTtl: 60 * 60 * 24 * 365 }
        );

        // ── Enqueue projection ───────────────────────────────────
        await env.PROJECTION_QUEUE.send(
          { id: recipe.id, doc: recipe },
          { contentType: 'json' }
        );

        // ── Discover new URLs ────────────────────────────────────
        const discovered = discoverRecipeUrls(html, domain);
        if (discovered.length > 0) {
          const stmts = discovered.slice(0, 50).map(u =>
            env.DB.prepare(`
              INSERT OR IGNORE INTO crawl_queue (url, domain, priority, next_crawl)
              VALUES (?, ?, 8, datetime('now', '+1 hour'))
            `).bind(u, domain)
          );
          await env.DB.batch(stmts);
        }

        msg.ack();

      } catch (err) {
        if (msg.attempts >= 3) {
          msg.ack(); // Route to DLQ
        } else {
          msg.retry({ delaySeconds: 60 });
        }
      }
    }
  }
};

function discoverRecipeUrls(html: string, domain: string): string[] {
  const hrefRegex = /href=["']([^"']+)["']/gi;
  const found = new Set<string>();
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const url = new URL(match[1], `https://${domain}`);
      if (
        url.hostname === domain ||
        url.hostname === `www.${domain}` &&
        RECIPE_PATH_SEGMENTS.some(seg => url.pathname.includes(seg))
      ) {
        found.add(url.href);
      }
    } catch { continue; }
  }

  return [...found];
}
```

---

## 8. Worker: Projection

**Trigger:** Queue consumer — `projection-jobs`  
**File:** `src/workers/projection.ts`  
**Max batch size:** 25  
**Max retries:** 5 (D1 writes can be retried safely — idempotent)

### Responsibilities
1. Upsert lean metadata row into D1 `recipes`
2. Upsert tag rows into D1 `recipe_tags`
3. Increment `recipe_count` on the `domains` table

### Logic

```typescript
export default {
  async queue(batch: MessageBatch<ProjectionJob>, env: Env) {
    const stmts: D1PreparedStatement[] = [];

    for (const msg of batch.messages) {
      const { id, doc } = msg.body;

      // ── Upsert recipe row ────────────────────────────────────
      stmts.push(
        env.DB.prepare(`
          INSERT OR REPLACE INTO recipes
            (id, title, domain, source_url, image_url, author,
             total_time, prep_time, cook_time, yields, cuisine, category,
             schema_valid, extracted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id, doc.title, doc.domain, doc.source_url, doc.image_url ?? null,
          doc.author ?? null, doc.total_time ?? null, doc.prep_time ?? null,
          doc.cook_time ?? null, doc.yields ?? null, doc.cuisine ?? null,
          doc.category ?? null, doc.schema_valid ? 1 : 0, doc.extracted_at
        )
      );

      // ── Delete existing tags (clean upsert) ──────────────────
      stmts.push(
        env.DB.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').bind(id)
      );

      // ── Insert new tags ──────────────────────────────────────
      for (const tag of (doc.tags ?? []).slice(0, 20)) {
        stmts.push(
          env.DB.prepare(
            'INSERT OR IGNORE INTO recipe_tags (recipe_id, tag) VALUES (?, ?)'
          ).bind(id, tag.toLowerCase().trim())
        );
      }

      // ── Increment domain counter ─────────────────────────────
      stmts.push(
        env.DB.prepare(`
          UPDATE domains SET recipe_count = recipe_count + 1 WHERE domain = ?
        `).bind(doc.domain)
      );

      msg.ack();
    }

    // D1 batch — up to 100 statements per call
    for (const chunk of chunks(stmts, 100)) {
      await env.DB.batch(chunk);
    }
  }
};
```

---

## 9. Worker: API

**Trigger:** HTTP via API Gateway (Workers Routes)  
**File:** `src/workers/api.ts`  
**Framework:** Hono  
**Routes prefix:** `/api/v1`

### Route Table

| Method | Path | Source | Description |
|---|---|---|---|
| GET | `/api/v1/recipes/:id` | KV | Full recipe detail |
| GET | `/api/v1/recipes` | D1 | Paginated list with filters |
| GET | `/api/v1/search` | D1 FTS | Full-text search |
| GET | `/api/v1/tags` | D1 | All tags with counts |
| GET | `/api/v1/domains` | D1 | All indexed domains |
| GET | `/api/v1/domains/:domain/recipes` | D1 | Recipes by domain |
| POST | `/api/v1/admin/seed` | D1 | Add domain to crawl list (auth required) |
| POST | `/api/v1/admin/rebuild` | KV→D1 | Trigger D1 rebuild (auth required) |
| POST | `/api/v1/remove` | — | Opt-out / removal request |

### Implementation

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { cache } from 'hono/cache';
import { bearerAuth } from 'hono/bearer-auth';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({ origin: ['https://reducedrecipes.com', 'http://localhost:5173'] }));

// ── GET /recipes/:id ─────────────────────────────────────────────────────────
app.get('/api/v1/recipes/:id',
  cache({ cacheName: 'recipe-detail', cacheControl: 'public, max-age=3600, s-maxage=86400' }),
  async (c) => {
    const raw = await c.env.RECIPES_KV.get(`recipe:${c.req.param('id')}`);
    if (!raw) return c.json({ error: 'Not found' }, 404);
    return c.json(JSON.parse(raw));
  }
);

// ── GET /recipes ─────────────────────────────────────────────────────────────
app.get('/api/v1/recipes', async (c) => {
  const { tag, domain, cuisine, max_time, min_time, cursor, limit = '24' } = c.req.query();
  const pageSize = Math.min(parseInt(limit), 100);

  let sql = `
    SELECT DISTINCT r.id, r.title, r.image_url, r.domain, r.source_url,
           r.author, r.total_time, r.yields, r.cuisine, r.extracted_at
    FROM recipes r
  `;
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  if (tag) {
    sql += ' JOIN recipe_tags t ON r.id = t.recipe_id';
    conditions.push('t.tag = ?');
    params.push(tag);
  }

  if (domain)    { conditions.push('r.domain = ?');        params.push(domain); }
  if (cuisine)   { conditions.push('r.cuisine = ?');       params.push(cuisine); }
  if (max_time)  { conditions.push('r.total_time <= ?');   params.push(parseInt(max_time)); }
  if (min_time)  { conditions.push('r.total_time >= ?');   params.push(parseInt(min_time)); }
  if (cursor)    { conditions.push('r.extracted_at < ?');  params.push(cursor); }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY r.extracted_at DESC LIMIT ?';
  params.push(pageSize + 1); // Fetch one extra to detect next page

  const results = await c.env.DB.prepare(sql).bind(...params).all();
  const items = results.results as RecipeSummary[];
  const hasMore = items.length > pageSize;
  if (hasMore) items.pop();

  return c.json({
    items,
    next_cursor: hasMore ? items[items.length - 1]?.extracted_at : null,
  });
});

// ── GET /search ───────────────────────────────────────────────────────────────
app.get('/api/v1/search', async (c) => {
  const { q, limit = '20' } = c.req.query();
  if (!q || q.trim().length < 2) return c.json({ items: [] });

  const pageSize = Math.min(parseInt(limit), 50);

  const results = await c.env.DB.prepare(`
    SELECT r.id, r.title, r.image_url, r.domain, r.source_url,
           r.author, r.total_time, r.yields, r.cuisine,
           snippet(recipes_fts, 1, '<mark>', '</mark>', '…', 12) AS snippet
    FROM recipes r
    JOIN recipes_fts fts ON r.rowid = fts.rowid
    WHERE recipes_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).bind(sanitizeFtsQuery(q), pageSize).all();

  return c.json({ items: results.results });
});

// ── GET /tags ────────────────────────────────────────────────────────────────
app.get('/api/v1/tags',
  cache({ cacheName: 'tags', cacheControl: 'public, max-age=3600' }),
  async (c) => {
    const results = await c.env.DB.prepare(`
      SELECT tag, COUNT(*) as count
      FROM recipe_tags
      GROUP BY tag
      ORDER BY count DESC
      LIMIT 200
    `).all();
    return c.json(results.results);
  }
);

// ── GET /domains ─────────────────────────────────────────────────────────────
app.get('/api/v1/domains',
  cache({ cacheName: 'domains', cacheControl: 'public, max-age=3600' }),
  async (c) => {
    const results = await c.env.DB.prepare(`
      SELECT domain, recipe_count, last_spidered
      FROM domains
      WHERE active = 1
      ORDER BY recipe_count DESC
    `).all();
    return c.json(results.results);
  }
);

// ── POST /admin/seed (protected) ─────────────────────────────────────────────
app.post(
  '/api/v1/admin/seed',
  bearerAuth({ token: (c) => c.env.ADMIN_TOKEN }),
  async (c) => {
    const { domain, sitemap_url, crawl_delay_ms = 3000 } = await c.req.json();
    if (!domain) return c.json({ error: 'domain required' }, 400);

    await env.DB.batch([
      env.DB.prepare(`
        INSERT OR IGNORE INTO domains (domain, sitemap_url, crawl_delay_ms)
        VALUES (?, ?, ?)
      `).bind(domain, sitemap_url ?? null, crawl_delay_ms),
    ]);

    return c.json({ ok: true });
  }
);

// ── POST /remove ─────────────────────────────────────────────────────────────
app.post('/api/v1/remove', async (c) => {
  const { url, email, reason } = await c.req.json();
  // Log removal request — processed manually
  console.log('REMOVAL_REQUEST', { url, email, reason, ts: new Date().toISOString() });
  return c.json({ ok: true, message: 'Request received. We will process it within 48 hours.' });
});

// ── FTS sanitisation ─────────────────────────────────────────────────────────
function sanitizeFtsQuery(q: string): string {
  // Remove FTS5 special chars to prevent injection / syntax errors
  return q.replace(/["'*^]/g, ' ').trim();
}

export default app;
```

---

## 10. Frontend

**Platform:** Cloudflare Pages  
**Framework:** React + Vite + TypeScript  
**Styling:** Tailwind CSS  
**State:** TanStack Query (server state) + Zustand (UI state)  
**Router:** React Router v6  

### Page Routes

| Path | Component | Data source |
|---|---|---|
| `/` | `HomePage` | `/api/v1/recipes?limit=24` |
| `/recipe/:id` | `RecipePage` | `/api/v1/recipes/:id` |
| `/search` | `SearchPage` | `/api/v1/search?q=` |
| `/tag/:tag` | `TagPage` | `/api/v1/recipes?tag=` |
| `/cuisine/:cuisine` | `CuisinePage` | `/api/v1/recipes?cuisine=` |
| `/site/:domain` | `DomainPage` | `/api/v1/domains/:domain/recipes` |
| `/remove` | `RemovePage` | POST `/api/v1/remove` |

### RecipePage Layout

The recipe detail page is the core product. Layout (top to bottom):

```
┌─────────────────────────────────────────────────────────┐
│  [Logo]          Search bar                  [Nav]       │
├─────────────────────────────────────────────────────────┤
│  [Recipe Image — hotlinked, lazy loaded, 16:9]          │
├─────────────────────────────────────────────────────────┤
│  Title                                                   │
│  By [Author Name]  ·  [domain]  ·  ⏱ 30 min  · 4 srv   │
│                                                          │
│  ┌──────────────────────┐  ┌───────────────────────┐    │
│  │  INGREDIENTS          │  │  INSTRUCTIONS          │    │
│  │  ─────────────────── │  │  ────────────────────  │    │
│  │  □ 200g spaghetti    │  │  1. Bring pot to boil  │    │
│  │  □ 100g guanciale    │  │  2. Fry guanciale...   │    │
│  │  □ 2 eggs            │  │  3. ...                │    │
│  └──────────────────────┘  └───────────────────────┘    │
│                                                          │
│  Tags: [pasta] [italian] [dinner]                        │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  📖 View Full Recipe on [domain]  →              │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Key UI rules:**
- "View Full Recipe" CTA must be visible above the fold on mobile
- Ingredients have checkboxes (local state — check off as you cook)
- Instructions are numbered, tap to highlight current step
- Image is `loading="lazy"` with a blurred placeholder
- Print button triggers `window.print()` — print stylesheet hides nav/CTA

### RecipeCard Component (list/search views)

```
┌─────────────────────┐
│   [Image 3:2]       │
├─────────────────────┤
│  Title              │
│  domain · ⏱ 30 min  │
└─────────────────────┘
```

### SEO

Every recipe page must have:
```html
<title>{recipe.title} - ReducedRecipes</title>
<meta name="description" content="Ingredients and instructions for {recipe.title}. Original recipe by {author} on {domain}.">
<link rel="canonical" href="https://reducedrecipes.com/recipe/{id}">
<meta property="og:image" content="{recipe.image_url}">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "{title}",
  "author": { "@type": "Person", "name": "{author}" },
  "url": "{source_url}",
  "sameAs": "{source_url}"
}
</script>
```

---

## 11. Search

### Phase 1: D1 FTS5 (launch)

SQLite FTS5 with Porter stemmer handles searches like "pasta carbonara", "chicken 30 minutes", "vegan dessert" accurately for hundreds of thousands of recipes. No additional cost.

Covered above in the D1 schema and API `/search` endpoint.

### Phase 2: Typesense (if needed post-launch)

If FTS5 quality is insufficient (typo tolerance, ranking, faceted search):

- Deploy Typesense Cloud ($25/mo for up to 1M documents)
- Add a D1 Stream trigger worker that syncs new/updated recipes to Typesense
- Replace the `/search` endpoint to proxy to Typesense

---

## 12. robots.txt & Crawl Ethics

### Our own robots.txt

```
User-agent: *
Disallow:

User-agent: ReducedRecipesBot
Allow: /
Crawl-delay: 0
```

### Bot behaviour contract

| Rule | Implementation |
|---|---|
| Respect `robots.txt` | `checkRobots()` called before every fetch, cached 24h in KV |
| Identify ourselves | `User-Agent: ReducedRecipesBot/1.0 (+https://reducedrecipes.com/bot)` |
| Crawl delay | Per-domain configurable, default 3000ms, stored in `domains.crawl_delay_ms` |
| No re-hosting images | `image_url` is always hotlinked — never written to R2 unless explicit permission |
| Opt-out | `/remove` form + `hello@reducedrecipes.com` — processed within 48h |
| Credit | Author name + link on every recipe card, always |

### `/bot` endpoint

Serve a human-readable page at `https://reducedrecipes.com/bot` explaining:
- What ReducedRecipesBot is
- What data it collects
- How to opt out (robots.txt or email)

---

## 13. Rate Limiting

Rate limiting is enforced in the Crawler Worker using KV token bucket per domain.

### Algorithm

```
Window = floor(now_ms / crawl_delay_ms)
Key    = rl:{domain}:{window}
TTL    = crawl_delay_ms * 2 ms (seconds)

If key exists → rate limited → requeue with delay
If key absent → set key to "1" → proceed
```

### Domain-specific delays (defaults)

| Domain type | `crawl_delay_ms` |
|---|---|
| Large sites (AllRecipes, BBC GoodFood) | 5000 |
| Medium blogs | 3000 (default) |
| Small personal blogs | 2000 |
| Sites that request it via `Crawl-delay` | Honour it (min 1000ms) |

---

## 14. D1 Rebuild Pipeline

Because D1 is a derived projection of KV, it can be fully rebuilt at any time.

**Trigger:** `POST /api/v1/admin/rebuild` (admin auth required)

```typescript
export async function rebuildD1FromKV(env: Env) {
  // 1. Truncate projection tables (not crawl_queue or domains)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM recipes'),
    env.DB.prepare('DELETE FROM recipe_tags'),
    env.DB.prepare("DELETE FROM recipes_fts WHERE true"), // FTS triggers handle sync
  ]);

  // 2. Stream all KV keys
  let cursor: string | undefined;

  do {
    const list = await env.RECIPES_KV.list({
      prefix: 'recipe:',
      cursor,
      limit: 100,
    });

    const docs: RecipeDocument[] = await Promise.all(
      list.keys.map(async (k) => {
        const raw = await env.RECIPES_KV.get(k.name);
        return raw ? JSON.parse(raw) : null;
      })
    ).then(results => results.filter(Boolean));

    // Enqueue projection jobs
    await env.PROJECTION_QUEUE.sendBatch(
      docs.map(doc => ({ body: { id: doc.id, doc }, contentType: 'json' as const }))
    );

    cursor = list.cursor ?? undefined;
  } while (cursor);
}
```

**Estimated rebuild time for 1M recipes:** ~2–4 hours (KV list rate limits apply)

---

## 15. Error Handling & Dead Letter Queue

### DLQ Worker

**File:** `src/workers/dlq.ts`  
**Trigger:** Queue consumers for `crawl-dlq`, `parse-dlq`, `projection-dlq`

```typescript
export default {
  async queue(batch: MessageBatch, env: Env) {
    for (const msg of batch.messages) {
      console.error('DLQ_MESSAGE', {
        queue: batch.queue,
        body: msg.body,
        attempts: msg.attempts,
        timestamp: new Date().toISOString(),
      });

      // For crawl failures — mark URL as permanently failed
      if (batch.queue === 'crawl-dlq') {
        const { url } = msg.body as CrawlJob;
        await env.DB.prepare(
          "UPDATE crawl_queue SET status = 'failed' WHERE url = ?"
        ).bind(url).run();
      }

      msg.ack();
    }
  }
};
```

Workers logs flow to Cloudflare Logpush → R2 or a log drain of your choice.

### Transient vs Permanent Errors

```typescript
function isTransientError(err: Error): boolean {
  const message = err.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('429')
  );
}
```

HTTP 429 (rate limited by target site): exponential back-off, max 3 retries, then `status = 'failed'` with `next_crawl` set 24h later.

---

## 16. Monitoring & Observability

### Cloudflare Analytics

Workers Analytics Engine tracks:
- Recipes crawled per hour
- Parse success rate (schema_valid vs fallback vs failed)
- API response times per route
- Search query volume

### Key Metrics to Track

| Metric | Source | Alert threshold |
|---|---|---|
| Crawl queue depth | D1 query | > 10,000 pending |
| Parse failure rate | DLQ volume | > 5% of batch |
| KV write errors | Worker logs | Any |
| D1 query P95 latency | Workers Analytics | > 200ms |
| API error rate | Workers Analytics | > 1% |

### Health Endpoint

```typescript
app.get('/api/v1/health', async (c) => {
  const [counts] = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM recipes) as total_recipes,
      (SELECT COUNT(*) FROM crawl_queue WHERE status = 'pending') as pending_crawls,
      (SELECT COUNT(*) FROM crawl_queue WHERE status = 'failed') as failed_crawls,
      (SELECT COUNT(*) FROM domains WHERE active = 1) as active_domains
  `).all();

  return c.json({ ok: true, ...counts.results[0] });
});
```

---

## 17. Monorepo & Workspace Setup

This is a **pnpm monorepo** with three workspace packages. Each package is independently buildable and deployable. Shared types and utilities live in `@rr/shared` and are consumed by both `@rr/workers` and `@rr/frontend` as a local workspace dependency — no publishing required.

### Package Dependency Graph

```
@rr/frontend  ──→  @rr/shared
@rr/workers   ──→  @rr/shared
```

### Root: `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
```

### Root: `package.json`

The root `package.json` holds no runtime dependencies — only monorepo-level dev tooling and scripts that delegate to each workspace.

```json
{
  "name": "reducedrecipes",
  "private": true,
  "scripts": {
    "dev":            "pnpm --filter @rr/frontend dev",
    "build":          "pnpm --filter @rr/shared build && pnpm --filter @rr/workers build && pnpm --filter @rr/frontend build",
    "deploy":         "pnpm --filter @rr/workers deploy",
    "deploy:api":     "pnpm --filter @rr/workers deploy:api",
    "deploy:crawler": "pnpm --filter @rr/workers deploy:crawler",
    "db:migrate":     "wrangler d1 migrations apply reduced-recipes-prod --config packages/workers/wrangler.api.toml",
    "db:migrate:preview": "wrangler d1 migrations apply reduced-recipes-preview --config packages/workers/wrangler.api.toml --env preview",
    "seed":           "pnpm tsx scripts/seed-domains.ts",
    "typecheck":      "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript":     "^5.4.0",
    "tsx":            "^4.7.0",
    "wrangler":       "^3.50.0"
  }
}
```

### Root: `tsconfig.base.json`

Inherited by all packages. Sets strict mode and the module resolution required for Workers and Vite.

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

---

## 18. Project Structure

```
reducedrecipes/                          ← repo root
├── pnpm-workspace.yaml
├── package.json                         ← root (scripts + dev tooling only)
├── tsconfig.base.json                   ← base TS config, inherited by all packages
│
├── packages/
│   │
│   ├── shared/                          ← @rr/shared
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types.ts                 ← RecipeDocument, Env, queue message shapes
│   │       ├── extract.ts               ← Schema.org extraction + normalisation
│   │       ├── robots.ts                ← robots.txt parser
│   │       ├── sitemap.ts               ← sitemap fetcher + XML parser
│   │       ├── rate-limit.ts            ← KV token bucket implementation
│   │       └── utils.ts                 ← chunk(), cleanText(), parseDuration()
│   │
│   ├── workers/                         ← @rr/workers (Cloudflare Workers)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── wrangler.api.toml            ← HTTP API worker config
│   │   ├── wrangler.orchestrator.toml   ← Cron worker config
│   │   ├── wrangler.crawler.toml        ← Queue consumer config
│   │   ├── wrangler.parser.toml         ← Queue consumer config
│   │   ├── wrangler.projection.toml     ← Queue consumer config
│   │   ├── wrangler.dlq.toml            ← DLQ consumer config
│   │   └── src/
│   │       ├── api.ts
│   │       ├── orchestrator.ts
│   │       ├── crawler.ts
│   │       ├── parser.ts
│   │       ├── projection.ts
│   │       └── dlq.ts
│   │
│   └── frontend/                        ← @rr/frontend (Cloudflare Pages)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── public/
│       └── src/
│           ├── pages/
│           │   ├── HomePage.tsx
│           │   ├── RecipePage.tsx
│           │   ├── SearchPage.tsx
│           │   ├── TagPage.tsx
│           │   └── RemovePage.tsx
│           ├── components/
│           │   ├── RecipeCard.tsx
│           │   ├── RecipeDetail.tsx
│           │   ├── IngredientList.tsx
│           │   ├── InstructionList.tsx
│           │   ├── SearchBar.tsx
│           │   ├── FilterBar.tsx
│           │   └── Layout.tsx
│           ├── hooks/
│           │   ├── useRecipe.ts
│           │   ├── useRecipes.ts
│           │   └── useSearch.ts
│           ├── lib/
│           │   └── api.ts               ← Typed API client
│           └── main.tsx
│
├── migrations/
│   └── 0001_initial.sql                 ← Full D1 schema (section 3.2)
│
└── scripts/
    ├── seed-domains.ts                  ← Bulk-insert initial domain list
    └── rebuild-d1.ts                    ← Manual D1 rebuild trigger
```

### `packages/shared/package.json`

```json
{
  "name": "@rr/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/types.ts",
  "exports": {
    ".": "./src/types.ts",
    "./extract": "./src/extract.ts",
    "./robots": "./src/robots.ts",
    "./sitemap": "./src/sitemap.ts",
    "./rate-limit": "./src/rate-limit.ts",
    "./utils": "./src/utils.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

### `packages/shared/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

### `packages/workers/package.json`

```json
{
  "name": "@rr/workers",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck":          "tsc --noEmit",
    "deploy":             "pnpm deploy:api && pnpm deploy:orchestrator && pnpm deploy:crawler && pnpm deploy:parser && pnpm deploy:projection && pnpm deploy:dlq",
    "deploy:api":         "wrangler deploy --config wrangler.api.toml",
    "deploy:orchestrator":"wrangler deploy --config wrangler.orchestrator.toml",
    "deploy:crawler":     "wrangler deploy --config wrangler.crawler.toml",
    "deploy:parser":      "wrangler deploy --config wrangler.parser.toml",
    "deploy:projection":  "wrangler deploy --config wrangler.projection.toml",
    "deploy:dlq":         "wrangler deploy --config wrangler.dlq.toml",
    "dev:api":            "wrangler dev --config wrangler.api.toml"
  },
  "dependencies": {
    "@rr/shared": "workspace:*",
    "hono": "^4.3.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240412.0",
    "typescript": "^5.4.0",
    "wrangler": "^3.50.0"
  }
}
```

### `packages/workers/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "paths": {
      "@rr/shared":        ["../shared/src/types.ts"],
      "@rr/shared/*":      ["../shared/src/*"]
    }
  },
  "include": ["src"]
}
```

The `paths` mapping means Workers source files import shared code as:
```typescript
import type { RecipeDocument } from '@rr/shared';
import { extractSchemaOrg } from '@rr/shared/extract';
import { checkRobots } from '@rr/shared/robots';
```
Wrangler resolves these at build time via the `tsconfig.json` path aliases — no separate build step needed for `@rr/shared`.

### `packages/frontend/package.json`

```json
{
  "name": "@rr/frontend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev":       "vite",
    "build":     "tsc && vite build",
    "preview":   "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@rr/shared":       "workspace:*",
    "react":            "^18.3.0",
    "react-dom":        "^18.3.0",
    "react-router-dom": "^6.23.0",
    "@tanstack/react-query": "^5.35.0",
    "zustand":          "^4.5.0"
  },
  "devDependencies": {
    "@types/react":        "^18.3.0",
    "@types/react-dom":    "^18.3.0",
    "@vitejs/plugin-react":"^4.3.0",
    "tailwindcss":         "^3.4.0",
    "autoprefixer":        "^10.4.0",
    "postcss":             "^8.4.0",
    "typescript":          "^5.4.0",
    "vite":                "^5.2.0"
  }
}
```

### `packages/frontend/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "paths": {
      "@rr/shared":   ["../shared/src/types.ts"],
      "@rr/shared/*": ["../shared/src/*"]
    }
  },
  "include": ["src"]
}
```

### `packages/frontend/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@rr/shared': path.resolve(__dirname, '../shared/src/types.ts'),
    },
  },
  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify(
      process.env.VITE_API_BASE ?? 'https://reducedrecipes.com'
    ),
  },
});
```

---

## 19. wrangler Configs

Each Worker has its own `wrangler.*.toml` in `packages/workers/`. They share identical binding definitions but differ in `name`, `main`, and triggers. A shared bindings snippet is documented once below, then each config shows only what differs.

### Shared bindings (present in ALL wrangler configs)

```toml
compatibility_date = "2024-04-14"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "reduced-recipes-prod"
database_id = "REPLACE_WITH_D1_ID"
migrations_dir = "../../migrations"

[[kv_namespaces]]
binding = "RECIPES_KV"
id = "REPLACE_WITH_RECIPES_KV_ID"

[[kv_namespaces]]
binding = "CACHE_KV"
id = "REPLACE_WITH_CACHE_KV_ID"

[[r2_buckets]]
binding = "IMAGES_R2"
bucket_name = "rr-images"

[[queues.producers]]
binding = "CRAWL_QUEUE"
queue = "crawl-jobs"

[[queues.producers]]
binding = "PARSE_QUEUE"
queue = "parse-jobs"

[[queues.producers]]
binding = "PROJECTION_QUEUE"
queue = "projection-jobs"

[vars]
BOT_USER_AGENT = "ReducedRecipesBot/1.0 (+https://reducedrecipes.com/bot)"
DEFAULT_CRAWL_DELAY_MS = "3000"
MAX_QUEUE_BATCH = "500"
ENVIRONMENT = "production"

[env.preview]
name = "WORKER_NAME-preview"

[[env.preview.d1_databases]]
binding = "DB"
database_name = "reduced-recipes-preview"
database_id = "REPLACE_WITH_PREVIEW_D1_ID"
```

### `wrangler.api.toml`

Serves HTTP traffic. No queue consumers. No cron.

```toml
name = "rr-api"
main = "src/api.ts"

# ── include shared bindings above ──

[vars]
ENVIRONMENT = "production"

# Preview environment
[env.preview]
name = "rr-api-preview"
```

### `wrangler.orchestrator.toml`

Cron-triggered. No HTTP. No queue consumers.

```toml
name = "rr-orchestrator"
main = "src/orchestrator.ts"

# ── include shared bindings above ──

[triggers]
crons = ["0 * * * *"]   # Every hour
```

### `wrangler.crawler.toml`

Queue consumer only. Reads from `crawl-jobs`, writes to `parse-jobs`.

```toml
name = "rr-crawler"
main = "src/crawler.ts"

# ── include shared bindings above ──

[[queues.consumers]]
queue = "crawl-jobs"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "crawl-dlq"
```

### `wrangler.parser.toml`

Queue consumer only. Reads from `parse-jobs`, writes to `projection-jobs`.

```toml
name = "rr-parser"
main = "src/parser.ts"

# ── include shared bindings above ──

[[queues.consumers]]
queue = "parse-jobs"
max_batch_size = 5
max_batch_timeout = 60
max_retries = 3
dead_letter_queue = "parse-dlq"
```

### `wrangler.projection.toml`

Queue consumer only. Reads from `projection-jobs`, writes to D1.

```toml
name = "rr-projection"
main = "src/projection.ts"

# ── include shared bindings above ──

[[queues.consumers]]
queue = "projection-jobs"
max_batch_size = 25
max_batch_timeout = 30
max_retries = 5
dead_letter_queue = "projection-dlq"
```

### `wrangler.dlq.toml`

Consumes all three dead letter queues.

```toml
name = "rr-dlq"
main = "src/dlq.ts"

# ── include shared bindings above ──

[[queues.consumers]]
queue = "crawl-dlq"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 0

[[queues.consumers]]
queue = "parse-dlq"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 0

[[queues.consumers]]
queue = "projection-dlq"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 0
```

---

## 20. Environment Variables & Secrets

Set via `wrangler secret put` — run once per worker that needs the secret:

```bash
# Run for each worker that uses ADMIN_TOKEN (only rr-api needs it)
wrangler secret put ADMIN_TOKEN --config packages/workers/wrangler.api.toml
```

| Secret | Used by | Purpose |
|---|---|---|
| `ADMIN_TOKEN` | `rr-api` | Bearer token for `/api/v1/admin/*` endpoints |

Non-sensitive vars are set in each `wrangler.*.toml` under `[vars]` (documented in section 19).

---

## 21. Deployment

### Initial Setup

```bash
# 1. Install all workspace dependencies from repo root
pnpm install

# 2. Login to Cloudflare
npx wrangler login

# 3. Create D1 databases
npx wrangler d1 create reduced-recipes-prod
npx wrangler d1 create reduced-recipes-preview
# → Copy database_ids into all wrangler.*.toml files

# 4. Create KV namespaces
npx wrangler kv:namespace create RECIPES_KV
npx wrangler kv:namespace create CACHE_KV
# → Copy IDs into all wrangler.*.toml files

# 5. Create Queues
npx wrangler queues create crawl-jobs
npx wrangler queues create parse-jobs
npx wrangler queues create projection-jobs
npx wrangler queues create crawl-dlq
npx wrangler queues create parse-dlq
npx wrangler queues create projection-dlq

# 6. Create R2 bucket
npx wrangler r2 bucket create rr-images

# 7. Run D1 migrations (uses api toml for DB config — same DB for all workers)
pnpm db:migrate

# 8. Set secrets
npx wrangler secret put ADMIN_TOKEN --config packages/workers/wrangler.api.toml

# 9. Deploy all workers
pnpm deploy

# 10. Deploy frontend to Pages (first time — link via Cloudflare dashboard)
#     Build command: pnpm --filter @rr/frontend build
#     Build output:  packages/frontend/dist
#     Root dir:      packages/frontend
#     Env var:       VITE_API_BASE=https://reducedrecipes.com

# 11. Seed initial domains
pnpm seed
```

### Deploying individual workers

```bash
# From repo root
pnpm --filter @rr/workers deploy:api
pnpm --filter @rr/workers deploy:crawler
pnpm --filter @rr/workers deploy:parser
pnpm --filter @rr/workers deploy:projection
pnpm --filter @rr/workers deploy:orchestrator
pnpm --filter @rr/workers deploy:dlq

# Or from packages/workers directly
cd packages/workers
pnpm deploy:api
```

### Local development

```bash
# API worker with live D1 + KV bindings
pnpm --filter @rr/workers dev:api

# Frontend against local API
VITE_API_BASE=http://localhost:8787 pnpm --filter @rr/frontend dev
```

### CI/CD (GitHub Actions)

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy-workers:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
      - run: pnpm deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}

  deploy-frontend:
    runs-on: ubuntu-latest
    needs: deploy-workers
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @rr/frontend build
        env:
          VITE_API_BASE: https://reducedrecipes.com
      - uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          projectName: reduced-recipes
          directory: packages/frontend/dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

---

## 22. Seed Data

Initial domain list — known Schema.org compliant recipe sites with sitemaps:

```typescript
// scripts/seed-domains.ts
const SEED_DOMAINS = [
  { domain: 'seriouseats.com',     sitemap_url: 'https://www.seriouseats.com/sitemap_index.xml',    crawl_delay_ms: 3000 },
  { domain: 'allrecipes.com',      sitemap_url: 'https://www.allrecipes.com/sitemap.xml',            crawl_delay_ms: 5000 },
  { domain: 'bonappetit.com',      sitemap_url: 'https://www.bonappetit.com/sitemap.xml',            crawl_delay_ms: 3000 },
  { domain: 'epicurious.com',      sitemap_url: 'https://www.epicurious.com/sitemap.xml',            crawl_delay_ms: 3000 },
  { domain: 'bbcgoodfood.com',     sitemap_url: 'https://www.bbcgoodfood.com/sitemap.xml',           crawl_delay_ms: 3000 },
  { domain: 'food52.com',          sitemap_url: 'https://food52.com/sitemap.xml',                    crawl_delay_ms: 3000 },
  { domain: 'smittenkitchen.com',  sitemap_url: 'https://smittenkitchen.com/sitemap.xml',            crawl_delay_ms: 2000 },
  { domain: 'budgetbytes.com',     sitemap_url: 'https://www.budgetbytes.com/sitemap_index.xml',     crawl_delay_ms: 2000 },
  { domain: 'minimalistbaker.com', sitemap_url: 'https://minimalistbaker.com/sitemap_index.xml',     crawl_delay_ms: 2000 },
  { domain: 'halfbakedharvest.com',sitemap_url: 'https://www.halfbakedharvest.com/sitemap_index.xml',crawl_delay_ms: 2000 },
  { domain: 'pinchofyum.com',      sitemap_url: 'https://pinchofyum.com/sitemap_index.xml',          crawl_delay_ms: 2000 },
  { domain: 'cookieandkate.com',   sitemap_url: 'https://cookieandkate.com/sitemap_index.xml',       crawl_delay_ms: 2000 },
  { domain: 'thekitchn.com',       sitemap_url: 'https://www.thekitchn.com/sitemap.xml',             crawl_delay_ms: 3000 },
  { domain: 'simplyrecipes.com',   sitemap_url: 'https://www.simplyrecipes.com/sitemap.xml',         crawl_delay_ms: 3000 },
  { domain: 'taste.com.au',        sitemap_url: 'https://www.taste.com.au/sitemap.xml',              crawl_delay_ms: 3000 },
];
```

---

## 23. Cost Model

### One-Time Crawl Cost (1M recipes)

| Item | Cost |
|---|---|
| Workers Paid Plan (first month) | $5.00 |
| Crawler invocations (1M × ~5s × 0.5GB) | ~$0.30 |
| Parser invocations (1M × ~1s × 256MB) | ~$0.10 |
| Projection invocations (1M × 100ms × 128MB) | ~$0.02 |
| D1 writes (5M statements) | ~$1.00 |
| KV writes (1M documents × 8KB avg) | ~$2.00 |
| Queue messages (3M total) | $0.00 (within free tier) |
| **Total one-time** | **~$9** |

### Monthly Operational Cost (steady state)

| Service | Monthly |
|---|---|
| Workers Paid Plan | $5.00 |
| KV storage (8GB recipes) | $3.50 |
| KV reads (10M/day included) | $0.00 |
| D1 storage (200MB projection) | $0.03 |
| D1 reads (5M/day included) | $0.00 |
| Queues (within free limits) | $0.00 |
| R2 (optional image caching) | $0.00–$2.00 |
| Pages (frontend) | $0.00 |
| **Total monthly** | **~$9–11** |

### Scaling Notes

- 10M recipes: KV storage ~$17/mo, D1 ~1GB still within cheap tier
- 10M monthly page views: Workers requests still within $5/mo plan or minimal overage at $0.30/million
- No CDN costs — Cloudflare edge caching is included

---

*End of specification. All code samples are TypeScript. All Cloudflare bindings assume Workers runtime with `nodejs_compat` compatibility flag enabled.*