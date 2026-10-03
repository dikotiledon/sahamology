-- Migration 038: Multi-Timeframe Alignment & Institutional Trend Matrix
-- Adapts Stan Weinstein's Stage Analysis and Alexander Elder's Triple Screen System
-- to track Weekly Tide (Stages 1-4) vs Daily Wave (EMA20/SMA50/SMA200) alignment.

CREATE TABLE IF NOT EXISTS multi_timeframe_matrix_daily (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  weekly_stage VARCHAR(30) NOT NULL DEFAULT 'STAGE_UNKNOWN',
  weekly_ema10 NUMERIC(12, 2),
  weekly_ema30 NUMERIC(12, 2),
  weekly_slope_pct NUMERIC(6, 2),
  daily_trend VARCHAR(30) NOT NULL DEFAULT 'NEUTRAL',
  daily_ema20 NUMERIC(12, 2),
  daily_sma50 NUMERIC(12, 2),
  daily_sma200 NUMERIC(12, 2),
  alignment_regime VARCHAR(40) NOT NULL DEFAULT 'MIXED_TRANSITION',
  sizing_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
  alignment_score INTEGER NOT NULL DEFAULT 50,
  advisory TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mtf_emiten_date UNIQUE (emiten, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_mtf_date_regime 
  ON multi_timeframe_matrix_daily (trade_date DESC, alignment_regime);

CREATE INDEX IF NOT EXISTS idx_mtf_emiten_date 
  ON multi_timeframe_matrix_daily (emiten, trade_date DESC);
