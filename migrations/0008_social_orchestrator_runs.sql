-- =============================================
-- Migration 0008: social-orchestrator run-state observability
-- =============================================
--
-- Records each daily orchestrator run so we can answer:
--   * did today's run start / finish / fail?
--   * how many candidates did the selector emit?
--   * was the run skipped because the killswitch was on?
--
-- Status values:
--   running     -- inserted at the start of every (non-killswitch) run
--   completed   -- updated when the run finishes successfully
--   failed      -- updated when the run throws; `error` populated
--   killswitch  -- inserted instead of `running` when RR_SOCIAL_KILLSWITCH:global is set
--
-- Pruned to last 90 days by ticket 012.

CREATE TABLE IF NOT EXISTS social_orchestrator_runs (
  id                  TEXT PRIMARY KEY,
  started_at          INTEGER NOT NULL, -- unix ms
  finished_at         INTEGER,          -- unix ms; null while in flight or for killswitch rows
  status              TEXT NOT NULL,
  candidates_emitted  INTEGER,
  drafts_created      INTEGER,
  error               TEXT
);
CREATE INDEX IF NOT EXISTS idx_orch_started_at ON social_orchestrator_runs(started_at);
