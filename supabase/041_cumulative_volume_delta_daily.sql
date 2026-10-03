-- Migration 041: Cumulative Volume Delta (CVD), Foreign Tape Aggression & Absorption Engine
-- Tracks single-bar volume delta proxies, 20d/50d rolling Cumulative Volume Delta (CVD),
-- Foreign Tape Aggression Ratio, and order flow divergences (Bullish Absorption vs Bearish Exhaustion).

CREATE TABLE IF NOT EXISTS cumulative_volume_delta_daily (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  bar_delta NUMERIC(16, 2) NOT NULL DEFAULT 0,
  cvd_20d NUMERIC(18, 2) NOT NULL DEFAULT 0,
  cvd_50d NUMERIC(18, 2) NOT NULL DEFAULT 0,
  delta_ratio_pct NUMERIC(6, 2) NOT NULL DEFAULT 0,
  foreign_buy_value NUMERIC(18, 2),
  foreign_sell_value NUMERIC(18, 2),
  foreign_aggression_ratio NUMERIC(6, 4) DEFAULT 0.5,
  divergence_type VARCHAR(40) NOT NULL DEFAULT 'NONE',
  confluence_regime VARCHAR(40) NOT NULL DEFAULT 'NEUTRAL_DELTA_ROTATION',
  conviction_score INTEGER NOT NULL DEFAULT 50,
  advisory TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cvd_emiten_date UNIQUE (emiten, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_cvd_date_regime 
  ON cumulative_volume_delta_daily (trade_date DESC, confluence_regime);

CREATE INDEX IF NOT EXISTS idx_cvd_emiten_date 
  ON cumulative_volume_delta_daily (emiten, trade_date DESC);
