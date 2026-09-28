-- Phase 4 (plan D11/D14): the macro-capture repairability marker.
--
-- Deliberately a SEPARATE flag from Phase 2's `capture_incomplete` and Phase 3's
-- `fundamentals_incomplete`, for the same reason those two are separate from
-- each other: the capture paths fail independently and must be repairable
-- independently. A day whose tape or broker-flow read failed but whose macro
-- fetch succeeded is not "macro incomplete", and a repair scoped to `--macro`
-- must not re-run the micro or fundamentals passes or keep re-fetching what the
-- other two already have. Merging them would make the repair scopes
-- indistinguishable and each would keep re-fetching what the other already has.
--
-- A transient network error, a 429, a vendor 400, or a timeout sets this flag.
-- The per-emiten analysis still completes and the card is still produced: G7
-- fails OPEN on absent data (plan D4), so a missed macro read downgrades the
-- regime to NOT_EVALUATED rather than blocking a signal. The flag exists so
-- the repair pass can go and get the data later, not so the run fails.
--
-- Defaults FALSE so every pre-Phase-4 row is complete by definition, and no
-- historical row is touched: this is a purely additive change. There is
-- deliberately no UPDATE statement in this file.

ALTER TABLE stock_queries
  ADD COLUMN IF NOT EXISTS macro_incomplete BOOLEAN NOT NULL DEFAULT FALSE;
