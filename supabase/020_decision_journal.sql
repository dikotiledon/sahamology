-- Decision journal: audit trail for every stance shown on the calculator.
-- The evaluator output is persisted verbatim (gates JSONB + scalar numbers) so
-- later phases can score forward outcomes without re-deriving the card.
CREATE TABLE IF NOT EXISTS decision_journal (
  id BIGSERIAL PRIMARY KEY,
  emiten TEXT NOT NULL,
  as_of DATE NOT NULL,
  stance TEXT NOT NULL,
  gates JSONB NOT NULL,
  entry NUMERIC,
  r1 NUMERIC,
  max NUMERIC,
  invalidation NUMERIC,
  rr NUMERIC,
  thesis TEXT,
  failed_gates TEXT[],
  outcome TEXT,
  r_multiple NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (emiten, as_of)
);

CREATE INDEX IF NOT EXISTS idx_decision_journal_emiten_as_of
  ON decision_journal(emiten, as_of DESC);
