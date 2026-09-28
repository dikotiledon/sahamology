-- Phase 2 cycle-1 additions (plan D18 + D20; audit F2 and F5).
--
-- D18 `stock_queries.capture_incomplete`: the repairability marker. The
-- capture guard in run-watchlist-analysis.ts skips any session that already
-- has a signal row, and saveWatchlistAnalysis upserts on (from_date, emiten).
-- So a day whose acc/dist or flow read failed writes a row with nulls and is
-- NEVER revisited — under D12 that signal is unscored for system (3) forever,
-- and because D10(7) counts exactly those, the gate's own coverage condition
-- degrades during an outage. Defaults false so every pre-Phase-2 row is
-- complete by definition.
--
-- D20 `broker_flow_daily.broker_seen_in_detector`: makes D9's sellers
-- cross-check structural at the write rather than a runtime lookup. A row is
-- only written when the code appeared in that session's detector list.

ALTER TABLE stock_queries
  ADD COLUMN IF NOT EXISTS capture_incomplete BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE broker_flow_daily
  ADD COLUMN IF NOT EXISTS broker_seen_in_detector BOOLEAN NOT NULL DEFAULT FALSE;
