# ReducedRecipes

**Recipes, reduced to what you actually need.**

No backstory about a trip to Tuscany. No ads between steps. No scroll to the bottom to find the ingredients. Just the list, the method, and the number of minutes until dinner.

## What is this?

An index of 150,000+ recipes from 670+ sources, stripped of SEO filler. We crawl recipe sites, extract the structured data, remove the bloat, and serve you just the recipe.

**By the numbers:**
- 150,000+ recipes indexed
- 670+ source domains
- 87% average bloat removed per page
- Auto-translated from 20+ languages via AI
- Zero ads, zero life stories

## Architecture

```
Cloudflare Workers (6 workers) → D1 (2 databases) → KV (4 namespaces) → R2
```

- **Crawl pipeline**: Orchestrator → Crawler → Parser → Projection (queue-based, fault-tolerant)
- **Translation**: Workers AI (Llama 3.1) for international recipes
- **Search**: Full-text search + ingredient-based search ("what's in your fridge")
- **Personalisation**: Auth (Google SSO), bookmarks, collections, shopping lists, dietary filtering
- **Real-time**: Durable Objects for collaborative shopping lists

See [spec/architecture.md](spec/architecture.md) for the full Mermaid architecture diagrams.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Cloudflare Workers + Hono |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| Storage | Cloudflare R2 |
| Real-time | Cloudflare Durable Objects |
| AI | Cloudflare Workers AI (Llama 3.1, m2m100) |
| Frontend | React + Vite → Cloudflare Pages |
| Mobile | React Native + Expo |
| Queues | Cloudflare Queues (6 queues + 3 DLQs) |

## Monorepo Structure

```
packages/
  workers/     — 6 Cloudflare Workers (API, orchestrator, crawler, parser, projection, DLQ)
  frontend/    — React SPA (Vite + Tailwind)
  mobile/      — Expo React Native app
  shared/      — Shared types, utils, extraction logic
spec/          — Feature specs & architecture docs
migrations/    — D1 schema (recipes database)
migrations-users/ — D1 schema (users database)
```

## Development

```bash
pnpm install
cd packages/workers && npx wrangler dev --config wrangler.api.toml
cd packages/frontend && npm run dev
cd packages/mobile && npx expo start
```

## License

This project is licensed under the [Business Source License 1.1](LICENSE).

**You may** use this code for personal, educational, or internal evaluation purposes.

**You may not** host a public service, commercially redistribute, or offer this as SaaS without a commercial license.

The license converts to Apache 2.0 after 4 years from each version's release.

For commercial licensing inquiries: jannik811@gmail.com
