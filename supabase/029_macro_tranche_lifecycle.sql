-- 029_macro_tranche_lifecycle.sql
-- Phase 9: Macro Dynamic Overlay & Multi-Account Tranche Execution

-- 1. Bank Indonesia Policy Rate (RDG) Decisions
CREATE TABLE IF NOT EXISTS bi_rate_decisions (
  id SERIAL PRIMARY KEY,
  meeting_date DATE UNIQUE NOT NULL,
  rate NUMERIC(5, 2) NOT NULL,
  previous_rate NUMERIC(5, 2) NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('HOLD', 'HIKE', 'CUT')),
  governor_statement TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bi_rate_decisions_date
  ON bi_rate_decisions(meeting_date DESC);

-- 2. Daily Rupiah Pressure & Macro Regime Status
CREATE TABLE IF NOT EXISTS macro_pressure_daily (
  id SERIAL PRIMARY KEY,
  trade_date DATE UNIQUE NOT NULL,
  usd_idr_close NUMERIC(10, 2) NOT NULL,
  velocity_5d_pct NUMERIC(6, 2) NOT NULL,
  velocity_20d_pct NUMERIC(6, 2) NOT NULL,
  pressure_score INTEGER NOT NULL CHECK (pressure_score BETWEEN 0 AND 100),
  regime TEXT NOT NULL CHECK (regime IN ('MACRO_HEADWIND', 'MACRO_NEUTRAL', 'MACRO_TAILWIND')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_macro_pressure_date
  ON macro_pressure_daily(trade_date DESC);

-- 3. Multi-Account Execution Tranches
CREATE TABLE IF NOT EXISTS execution_tranches (
  id SERIAL PRIMARY KEY,
  audit_id INTEGER REFERENCES execution_audits(id) ON DELETE CASCADE,
  tranche_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  lot_size INTEGER NOT NULL,
  target_session TEXT NOT NULL,
  executed_price NUMERIC(12, 2),
  slippage_ticks INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'FILLED', 'CANCELLED', 'SKIPPED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_tranches_audit
  ON execution_tranches(audit_id, tranche_number);
