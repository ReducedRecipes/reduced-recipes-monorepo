-- Source content selected for adaptation each day.
CREATE TABLE social_source_candidates (
  id              TEXT PRIMARY KEY,
  recipe_id       TEXT NOT NULL,
  selection_reason TEXT NOT NULL,
  selection_score REAL NOT NULL,
  theme           TEXT,
  selected_at     INTEGER NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id)
);
CREATE INDEX idx_source_selected_at ON social_source_candidates(selected_at);

CREATE TABLE social_drafts (
  id              TEXT PRIMARY KEY,
  source_id       TEXT NOT NULL,
  platform        TEXT NOT NULL,
  variant_label   TEXT,
  caption         TEXT,
  hashtags        TEXT,
  hook            TEXT,
  script          TEXT,
  cta_text        TEXT,
  cta_url         TEXT,
  asset_r2_keys   TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  model           TEXT NOT NULL,
  generation_cost_usd REAL,
  status          TEXT NOT NULL,
  rejection_reason TEXT,
  approved_at     INTEGER,
  scheduled_for   INTEGER,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (source_id) REFERENCES social_source_candidates(id)
);
CREATE INDEX idx_drafts_status ON social_drafts(status);
CREATE INDEX idx_drafts_platform_status ON social_drafts(platform, status);
CREATE INDEX idx_drafts_scheduled ON social_drafts(scheduled_for) WHERE status = 'scheduled';

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

CREATE TABLE social_metrics_snapshots (
  id              TEXT PRIMARY KEY,
  post_id         TEXT NOT NULL,
  captured_at     INTEGER NOT NULL,
  age_hours       INTEGER NOT NULL,
  impressions INTEGER, reach INTEGER, likes INTEGER, comments INTEGER,
  shares INTEGER, saves INTEGER, click_throughs INTEGER, video_views INTEGER,
  video_avg_watch_seconds REAL,
  FOREIGN KEY (post_id) REFERENCES social_posts(id)
);
CREATE INDEX idx_metrics_post_age ON social_metrics_snapshots(post_id, age_hours);

CREATE TABLE social_attribution (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL, date TEXT NOT NULL,
  sessions INTEGER NOT NULL DEFAULT 0,
  installs INTEGER NOT NULL DEFAULT 0,
  signups INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (post_id) REFERENCES social_posts(id),
  UNIQUE(post_id, date)
);

CREATE TABLE social_prompt_versions (
  id TEXT PRIMARY KEY, platform TEXT NOT NULL, variant_label TEXT NOT NULL,
  template TEXT NOT NULL, notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_prompts_platform_active ON social_prompt_versions(platform, active);

CREATE TABLE social_editorial_calendar (
  id TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  theme TEXT NOT NULL, cuisine_filter TEXT,
  weight REAL NOT NULL DEFAULT 1.0,
  notes TEXT
);

-- AI-generated ingredient image cache. Architecturally mandatory:
-- without this layer the all-AI image cost blows the $50 ceiling.
CREATE TABLE social_ingredient_image_cache (
  ingredient_key  TEXT PRIMARY KEY,
  r2_key          TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  model           TEXT NOT NULL,
  generated_at    INTEGER NOT NULL,
  bytes           INTEGER NOT NULL
);
