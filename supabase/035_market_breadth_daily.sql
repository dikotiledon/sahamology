-- Migration 035: IDX Market Breadth & Composite Liquidity Engine (IHSG Pulse)
-- Tracks daily Advance/Decline ratios, moving average participation (> EMA20, > SMA50, > SMA200),
-- 52-week High/Low expansion, aggregate foreign flow velocity, and market health regimes.

CREATE TABLE IF NOT EXISTS market_breadth_daily (
  id BIGSERIAL PRIMARY KEY,
  trade_date DATE NOT NULL UNIQUE,
  advancers INT NOT NULL DEFAULT 0,
  decliners INT NOT NULL DEFAULT 0,
  unchanged INT NOT NULL DEFAULT 0,
  ad_ratio NUMERIC(6, 2) NOT NULL DEFAULT 1.0,
  pct_above_ema20 NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
  pct_above_sma50 NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
  pct_above_sma200 NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
  new_highs_52w INT NOT NULL DEFAULT 0,
  new_lows_52w INT NOT NULL DEFAULT 0,
  net_foreign_flow NUMERIC(16, 2) NOT NULL DEFAULT 0.0,
  market_regime VARCHAR(40) NOT NULL DEFAULT 'BULLISH_EXPANSION',
  regime_score INT NOT NULL DEFAULT 50,
  constituent_count INT NOT NULL DEFAULT 0,
  advisory TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_breadth_date_regime ON market_breadth_daily(trade_date DESC, market_regime);
