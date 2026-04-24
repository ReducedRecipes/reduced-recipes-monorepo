# Database Backups

## 2026-04-24: Legacy crawl tables removed from prod DB

The `crawl_queue` (738K rows) and `domains` (1,297 rows) tables were removed from
`reduced-recipes-prod` (D1). They were stale duplicates — the authoritative data
lives in `reduced-recipes-crawl` (CRAWL_DB).

### What was done
1. Exported full backups before any deletions
2. Deleted only completed rows (`done`, `no_schema`, `skipped`, `failed`) first
3. Exported remaining pending/crawling rows and imported them into CRAWL_DB with `INSERT OR IGNORE`
4. Only 265 new rows were added (rest already existed in CRAWL_DB)
5. Dropped both tables from prod DB

### Local backup files (not committed — too large for git)
- `/tmp/rr-prod-crawl-queue-backup.sql` (197MB) — full crawl_queue before any deletions
- `/tmp/rr-prod-domains-backup.sql` (292KB) — full domains table
- `/tmp/rr-prod-crawl-remaining.sql` — pending/crawling rows before migration

### Cloudflare R2 export URLs (expired after 1 hour, but D1 time-travel is available)
D1 time-travel can restore the database to any point in the last 30 days.
Use `wrangler d1 time-travel` to restore if needed.

### Result
- Prod DB: 999MB -> 661MB
- All pending crawl URLs preserved in CRAWL_DB
