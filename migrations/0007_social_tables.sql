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
