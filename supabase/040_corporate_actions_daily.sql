-- Migration 040: Corporate Actions, Ex-Date Dividend Arbitrage & Rights Issue Dilution Risk Engine
-- Tracks Cash Dividends (Cum/Ex Dates, Dividend Trap Risk Score, Pre-Cum Run-Up),
-- Rights Issues (HMETD dilution, exercise discount, standby buyers), and Stock Splits on the IDX.

CREATE TABLE IF NOT EXISTS corporate_actions_daily (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  action_type VARCHAR(30) NOT NULL DEFAULT 'DIVIDEND',
  cum_date DATE,
  ex_date DATE,
  recording_date DATE,
  payment_date DATE,
  dividend_amount NUMERIC(12, 2),
  dividend_yield_pct NUMERIC(6, 2),
  ex_date_drop_ratio NUMERIC(6, 2),
  dividend_trap_score NUMERIC(5, 2) DEFAULT 0,
  days_to_cum INT,
  rights_ratio VARCHAR(30),
  rights_exercise_price NUMERIC(12, 2),
  theoretical_price NUMERIC(12, 2),
  dilution_pct NUMERIC(6, 2),
  standby_buyer VARCHAR(100),
  has_standby_buyer BOOLEAN DEFAULT FALSE,
  confluence_regime VARCHAR(40) NOT NULL DEFAULT 'NEUTRAL_CORPORATE_ACTION',
  conviction_score INTEGER NOT NULL DEFAULT 50,
  advisory TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_corp_actions_emiten_date UNIQUE (emiten, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_corp_actions_date_regime 
  ON corporate_actions_daily (trade_date DESC, confluence_regime);

CREATE INDEX IF NOT EXISTS idx_corp_actions_emiten_date 
  ON corporate_actions_daily (emiten, trade_date DESC);
