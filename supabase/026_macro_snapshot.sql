-- Phase 4 (plan D6/D7): the captured macro snapshot.
--
-- GRAIN: one row per (symbol, bar_date) — one vendor bar for one macro series on
-- one trading session. `bar_date` is the SESSION date the vendor reports, not
-- the capture date: the historical-summary endpoint returns dated bars, and the
-- whole point-in-time argument in this phase rests on that distinction (a replay
-- must know which session a number belongs to, independently of when we fetched
-- it).
--
-- SERIES IDENTITY, AND THE GOLD TRAP (D13): `symbol` holds the vendor's ticker
-- verbatim. Measured 2026-09-28 (artifacts/macro-probe.json):
--   IHSG   type_company "Index"       "Index Harga Saham Gabungan"
--   USDIDR type_company "FX"          "US Dollar / Rupiah"
--   XAU    type_company "commodities" "Gold"
--   OIL    type_company "commodities" "Crude Oil"
--   BRENT  type_company "commodities" "Brent Oil"
-- `GOLD` is deliberately NOT a row here. It answers HTTP 200 and resolves to an
-- IDX emiten ("Visi Telekomunikasi Infrastruktur Tbk.", type "Saham"), so a
-- capture job that trusted the ticker NAME would have written a 272-IDR telecom
-- price into the gold leg and corrupted every commodity clause. The set of
-- admissible symbols is closed in lib/macro/types.ts (MACRO_SERIES) and root
-- gate G9 fails the build if GOLD is ever admitted.
--
-- WHY RAW BARS RATHER THAN A STORED VERDICT (D7, inherited from Phase 3): the
-- table stores what the vendor said and nothing else. The regime is classified
-- at READ time, so retuning a threshold after the Phase 4 correlation study
-- re-scores every historical day without a backfill. Storing a state string
-- here would freeze today's rules into yesterday's data and turn every
-- threshold change into a migration.
--
-- CALENDAR ASYMMETRY: IDX trades Mon-Fri minus holidays while USDIDR emits bars
-- every day, so the series do not share a calendar. Nothing in this schema tries
-- to reconcile that; the as-of join (bar_date <= asOf, latest wins) lives in
-- lib/db.ts and is the only sanctioned way to read across series.
--
-- `close` is NOT NULL and is the only field the classifier reads for regime
-- state. `volume` and `value` are carried because the vendor returns them and
-- an index has no meaningful volume — they are context for the operator, not
-- inputs to any clause.

CREATE TABLE IF NOT EXISTS macro_snapshot (
  symbol      TEXT        NOT NULL,
  bar_date    DATE        NOT NULL,
  close       NUMERIC     NOT NULL,
  volume      NUMERIC     NOT NULL DEFAULT 0,
  value       NUMERIC     NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, bar_date)
);

-- Every regime read is "the newest bars for this symbol at or before asOf",
-- which is exactly a (symbol, bar_date DESC) range scan.
CREATE INDEX IF NOT EXISTS idx_macro_snapshot_lookup
  ON macro_snapshot (symbol, bar_date DESC);
