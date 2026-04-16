-- =============================================
-- Migration 0001: Core user tables (Phase 1a)
-- =============================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,  -- UUIDv4
  email           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  picture_url     TEXT,
  profile_public  INTEGER NOT NULL DEFAULT 1,  -- 1 = public, 0 = private
  tier            TEXT NOT NULL DEFAULT 'free',  -- 'free', 'premium' (future)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Auth providers (supports Google now, Apple/others later)
CREATE TABLE IF NOT EXISTS user_auth_providers (
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,  -- 'google', 'apple' (future)
  provider_id     TEXT NOT NULL,  -- Google sub, Apple sub, etc.
  provider_email  TEXT,
  provider_name   TEXT,
  provider_avatar TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, provider),
  UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_uap_provider ON user_auth_providers(provider, provider_id);

-- Dietary preferences
CREATE TABLE IF NOT EXISTS user_dietary_preferences (
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restriction     TEXT NOT NULL,  -- e.g. 'vegetarian', 'gluten-free'
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, restriction)
);

-- Collections (bookmark folders)
CREATE TABLE IF NOT EXISTS collections (
  id              TEXT PRIMARY KEY,  -- UUIDv4
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  is_default      INTEGER NOT NULL DEFAULT 0,  -- 1 = the "Saved" collection
  is_public       INTEGER NOT NULL DEFAULT 1,
  position        INTEGER NOT NULL DEFAULT 0,  -- sort order
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id);

-- Bookmarks
CREATE TABLE IF NOT EXISTS bookmarks (
  id              TEXT PRIMARY KEY,  -- UUIDv4
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id   TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  recipe_id       TEXT NOT NULL,  -- references recipes DB (cross-DB, not FK)
  recipe_deleted_at TEXT,  -- set by recipe-deletion-fanout consumer
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, collection_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_collection ON bookmarks(collection_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_recipe ON bookmarks(recipe_id);

-- Recipe views (for recommendations in Phase 4, start collecting in Phase 1a)
-- Deduplicated: one view per user per recipe per calendar day
CREATE TABLE IF NOT EXISTS recipe_views (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id       TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'view',  -- 'view', 'cooked'
  viewed_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, recipe_id, date(viewed_at))
);

CREATE INDEX IF NOT EXISTS idx_recipe_views_user ON recipe_views(user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_views_recipe ON recipe_views(recipe_id);

-- Notifications (in-app bell, all phases)
CREATE TABLE IF NOT EXISTS notifications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,  -- 'new_follower', 'review_reply', 'shared_list_update', 'flagged_review_outcome'
  payload         TEXT NOT NULL DEFAULT '{}',  -- JSON
  read            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);

-- GDPR consent records
CREATE TABLE IF NOT EXISTS consent_records (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type    TEXT NOT NULL,  -- 'terms_of_service', 'privacy_policy', 'dietary_health_data'
  granted         INTEGER NOT NULL DEFAULT 1,  -- 1 = granted, 0 = withdrawn
  ip_address      TEXT,  -- recorded at time of consent for audit
  user_agent      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_records(user_id, consent_type);
