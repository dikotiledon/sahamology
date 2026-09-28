-- Phase 3 (plan D6/D7): the captured KeyStats snapshot.
--
-- GRAIN: one row per (emiten, as_of, item_name). The live endpoint returns a
-- CURRENT snapshot of ~94 flat {id, name, value} items across 12 categories,
-- carrying NO fiscal period and NO publication date (measured 2026-09-28,
-- see artifacts/keystats-probe-bbri.json). So the grain is per metric per
-- capture day, and nothing is keyed by a period that does not exist.
--
-- WHY RAW ITEMS RATHER THAN A STORED VERDICT (D7): the snapshot stores what
-- the vendor said and nothing else. The rubric is evaluated at READ time, so
-- correcting a threshold or fixing the bank rule re-scores every historical
-- day without a backfill. Storing a verdict string here would freeze today's
-- rules into yesterday's data and make every rubric change a migration.
--
-- `value_num` is nullable and means EXACTLY "the vendor gave no number".
-- It is never 0 for missing data: a 0 would make NEGATIVE_EQUITY and
-- EXTREME_LEVERAGE evaluate false and turn absent data into a healthy
-- verdict (D18). `value_text` keeps the raw string so the parse is auditable
-- and reversible.

CREATE TABLE IF NOT EXISTS keystats_snapshot (
  emiten      TEXT        NOT NULL,
  as_of       DATE        NOT NULL,
  item_name   TEXT        NOT NULL,
  category    TEXT,
  value_text  TEXT,
  value_num   NUMERIC,
  scale       TEXT,
  currency    TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (emiten, as_of, item_name)
);

-- Replay reads "the snapshot for this emiten on or before this signal date",
-- so the lookup is always an (emiten, as_of) range scan.
CREATE INDEX IF NOT EXISTS idx_keystats_snapshot_emiten_asof
  ON keystats_snapshot (emiten, as_of);
