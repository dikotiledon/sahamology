-- Migration 034: Volatility Contraction Pattern (VCP) & Minervini Trend Template Engine
-- Daily VCP contraction waves, volume dry-up, pivot price, and Stage 2 Trend Template verification.

CREATE TABLE IF NOT EXISTS vcp_patterns_daily (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  trend_template_passed BOOLEAN NOT NULL DEFAULT FALSE,
  sma_50 NUMERIC(12, 2),
  sma_150 NUMERIC(12, 2),
  sma_200 NUMERIC(12, 2),
  pct_from_52w_high NUMERIC(6, 2),
  pct_from_52w_low NUMERIC(6, 2),
  contraction_count INT NOT NULL DEFAULT 0,
  contractions JSONB NOT NULL DEFAULT '[]'::jsonb,
  pivot_price NUMERIC(12, 2),
  stop_loss_price NUMERIC(12, 2),
  volume_dry_up_ratio NUMERIC(6, 2),
  vcp_stage VARCHAR(30) NOT NULL DEFAULT 'DEVELOPING',
  confluence_tag VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vcp_emiten_date UNIQUE (emiten, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_vcp_date_stage ON vcp_patterns_daily(trade_date DESC, vcp_stage);
