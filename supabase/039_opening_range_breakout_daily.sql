-- Migration 039: Opening Range Breakout (ORB) & Intraday Initial Balance (IB) Engine
-- Tracks the 15-minute Initial Balance (IB15: 09:00-09:15 WIB), 60-minute Initial Balance (IB60),
-- Range Extension targets (R1, R2, S1, S2), and Steidlmayer market day profile classifications.

CREATE TABLE IF NOT EXISTS opening_range_breakout_daily (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  ib15_high NUMERIC(12, 2) NOT NULL,
  ib15_low NUMERIC(12, 2) NOT NULL,
  ib15_range NUMERIC(12, 2) NOT NULL,
  ib15_midpoint NUMERIC(12, 2) NOT NULL,
  ib60_high NUMERIC(12, 2),
  ib60_low NUMERIC(12, 2),
  ib60_range NUMERIC(12, 2),
  ib60_midpoint NUMERIC(12, 2),
  extension_r1 NUMERIC(12, 2),
  extension_r2 NUMERIC(12, 2),
  extension_s1 NUMERIC(12, 2),
  extension_s2 NUMERIC(12, 2),
  day_type VARCHAR(30) NOT NULL DEFAULT 'NORMAL_VARIATION_DAY',
  confluence_regime VARCHAR(40) NOT NULL DEFAULT 'INSIDE_IB_COILING',
  conviction_score INTEGER NOT NULL DEFAULT 50,
  v15m_volume NUMERIC(16, 2),
  advisory TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_orb_emiten_date UNIQUE (emiten, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_orb_date_regime 
  ON opening_range_breakout_daily (trade_date DESC, confluence_regime);

CREATE INDEX IF NOT EXISTS idx_orb_emiten_date 
  ON opening_range_breakout_daily (emiten, trade_date DESC);
