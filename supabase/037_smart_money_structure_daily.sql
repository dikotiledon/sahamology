-- Migration 037: Institutional Order Blocks, Fair Value Gaps (FVG) & Liquidity Sweep Engine
-- Tracks daily Smart Money Concepts (SMC) market structure, unmitigated order blocks, 
-- imbalances (FVGs with 50% Consequent Encroachment), and stop-hunt liquidity sweeps.

CREATE TABLE IF NOT EXISTS smart_money_structure_daily (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  market_structure VARCHAR(30) NOT NULL DEFAULT 'RANGING',
  last_bos_price NUMERIC(12, 2),
  last_bos_date DATE,
  active_bullish_ob JSONB,
  active_bullish_fvg JSONB,
  last_liquidity_sweep JSONB,
  confluence_regime VARCHAR(40) NOT NULL DEFAULT 'NEUTRAL_STRUCTURE',
  regime_score INTEGER NOT NULL DEFAULT 50,
  advisory TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_smart_money_emiten_date UNIQUE (emiten, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_smc_date_regime 
  ON smart_money_structure_daily (trade_date DESC, confluence_regime);

CREATE INDEX IF NOT EXISTS idx_smc_emiten_date 
  ON smart_money_structure_daily (emiten, trade_date DESC);
