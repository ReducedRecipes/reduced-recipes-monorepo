-- =============================================
-- Migration 0012: Social shortlink hit log
-- =============================================
-- Append-only attribution log written by the rr-social-shortlink Worker on
-- every public hit to r.reduced.recipes/<draftId>. Joined nightly into
-- social_attribution by the metrics-collector Worker (ticket 015).

CREATE TABLE IF NOT EXISTS social_shortlink_hits (
  id          TEXT PRIMARY KEY,
  draft_id    TEXT NOT NULL,
  hit_at      INTEGER NOT NULL,
  country     TEXT,
  referer     TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_shortlink_hits_draft  ON social_shortlink_hits(draft_id);
CREATE INDEX IF NOT EXISTS idx_shortlink_hits_hit_at ON social_shortlink_hits(hit_at);
