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

CREATE TABLE IF NOT EXISTS crawl_queue (
  url          TEXT PRIMARY KEY,
  domain       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  priority     INTEGER NOT NULL DEFAULT 5,
  fail_count   INTEGER NOT NULL DEFAULT 0,
  last_crawled TEXT,
  next_crawl   TEXT NOT NULL DEFAULT (datetime('now')),
  added_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crawl_due ON crawl_queue(status, next_crawl);
CREATE INDEX IF NOT EXISTS idx_crawl_domain ON crawl_queue(domain);
CREATE INDEX IF NOT EXISTS idx_crawl_status_domain ON crawl_queue(status, domain, priority, next_crawl);
