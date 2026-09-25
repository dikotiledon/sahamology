-- Trading journal: audit trail for tracked trade ideas.
-- Every row records the stance at signal time, the deterministic target set,
-- the invalidation level, and later the realized exit outcome.
CREATE TABLE IF NOT EXISTS trade_journal (
  id BIGSERIAL PRIMARY KEY,
  emiten TEXT NOT NULL,
  signal_date DATE NOT NULL,
  stance TEXT NOT NULL,
  entry_price NUMERIC,
  target_realistis NUMERIC,
  target_max NUMERIC,
  invalidation_price NUMERIC,
  net_rr NUMERIC,
  bandar_code TEXT,
  broker_type TEXT,
  blockers TEXT,
  exit_price NUMERIC,
  exit_reason TEXT,
  net_pnl NUMERIC,
  exit_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (emiten, signal_date)
);

CREATE INDEX IF NOT EXISTS idx_trade_journal_signal_date ON trade_journal(signal_date);
