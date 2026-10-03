-- Migration 032: Cognitive Post-Trade Journal & Execution Discipline Engine
-- Post-trade behavioral deviation tracking, discipline score, and trader tilt management.

CREATE TABLE IF NOT EXISTS cognitive_trade_reviews (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  planned_entry NUMERIC(12, 2) NOT NULL,
  realized_entry NUMERIC(12, 2) NOT NULL,
  planned_stop NUMERIC(12, 2) NOT NULL,
  realized_exit NUMERIC(12, 2),
  planned_lots INT NOT NULL,
  realized_lots INT NOT NULL,
  discipline_score INT NOT NULL CHECK (discipline_score BETWEEN 0 AND 100),
  grade VARCHAR(30) NOT NULL,
  deviations JSONB NOT NULL DEFAULT '[]'::jsonb,
  psychological_state VARCHAR(30) DEFAULT 'CALM',
  trader_reflection TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trader_psychological_capital (
  id INT PRIMARY KEY DEFAULT 1,
  capital_score INT NOT NULL DEFAULT 100 CHECK (capital_score BETWEEN 0 AND 100),
  consecutive_violations INT NOT NULL DEFAULT 0,
  tilt_state VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (tilt_state IN ('NORMAL', 'CAUTION', 'TILT_LOCKOUT')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cognitive_reviews_emiten ON cognitive_trade_reviews(emiten, trade_date);
