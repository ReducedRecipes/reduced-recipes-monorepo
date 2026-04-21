-- Funding & transparency tables

CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  message TEXT,
  source TEXT NOT NULL DEFAULT 'kofi',
  kofi_transaction_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monthly_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL UNIQUE,  -- e.g. '2026-04'
  d1_reads REAL NOT NULL DEFAULT 0,
  workers_ai REAL NOT NULL DEFAULT 0,
  queues REAL NOT NULL DEFAULT 0,
  kv REAL NOT NULL DEFAULT 0,
  durable_objects REAL NOT NULL DEFAULT 0,
  r2 REAL NOT NULL DEFAULT 0,
  workers_base REAL NOT NULL DEFAULT 5.00,
  other REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_donations_created ON donations(created_at);
CREATE INDEX idx_monthly_costs_month ON monthly_costs(month);
