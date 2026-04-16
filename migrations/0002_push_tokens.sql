-- Push notification token storage
CREATE TABLE IF NOT EXISTS push_tokens (
  token         TEXT PRIMARY KEY,
  platform      TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  registered_at TEXT NOT NULL DEFAULT (datetime('now'))
);
