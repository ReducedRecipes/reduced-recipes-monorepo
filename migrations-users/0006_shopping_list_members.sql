CREATE TABLE IF NOT EXISTS shopping_list_members (
  shopping_list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (shopping_list_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_slm_user ON shopping_list_members(user_id);
