-- Phase 3 (plan D11): the fundamental-capture repairability marker.
--
-- Deliberately a SEPARATE flag from Phase 2's `capture_incomplete` (D14).
-- The two capture paths fail independently and must be repairable
-- independently: a day whose acc/dist read failed but whose KeyStats fetch
-- succeeded is not "fundamentally incomplete", and a day that missed only
-- fundamentals must not re-run the micro/flow repair pass. Merging them would
-- make `--micro` and `--fundamentals` repair scopes indistinguishable and each
-- would keep re-fetching what the other already has.
--
-- A transient network error, a 429, or a timeout sets this flag. The signal
-- analysis still completes and the card is still produced (D11): G5 fails
-- OPEN on absent data, so a missed fundamental read downgrades a signal to
-- NOT_EVALUATED rather than blocking it. The flag exists so the repair pass
-- can go and get the data later, not so the run fails.
--
-- Defaults FALSE so every pre-Phase-3 row is complete by definition, and no
-- historical row is touched: this is a purely additive change.

ALTER TABLE stock_queries
  ADD COLUMN IF NOT EXISTS fundamentals_incomplete BOOLEAN NOT NULL DEFAULT FALSE;
