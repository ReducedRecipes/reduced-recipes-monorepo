-- ---------------------------------------------
-- Core recipe projection (lean — no blobs)
-- ---------------------------------------------
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

-- ---------------------------------------------
-- Tag normalisation table
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag       TEXT NOT NULL,
  PRIMARY KEY (recipe_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_recipe_tags_tag ON recipe_tags(tag);

-- ---------------------------------------------
-- Crawl queue & scheduling
-- ---------------------------------------------
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

-- ---------------------------------------------
-- Domain registry (seed list + metadata)
-- ---------------------------------------------
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

-- ---------------------------------------------
-- FTS5 virtual table (title + tags + author)
-- ---------------------------------------------
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
