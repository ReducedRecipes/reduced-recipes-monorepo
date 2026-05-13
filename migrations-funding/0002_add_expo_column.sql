-- Track Expo / EAS subscription cost separately from generic "other"
-- so the transparency page can attribute it correctly.

ALTER TABLE monthly_costs ADD COLUMN expo REAL NOT NULL DEFAULT 0;
