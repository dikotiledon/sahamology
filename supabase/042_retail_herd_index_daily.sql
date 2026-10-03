-- Migration 042: Retail Herd Dispersion, Broker Concentration & Syndicate Asymmetry Engine
-- Tracks the Retail Herd Index (RHI: 0-100), Syndicate Asymmetry Ratio (SAR),
-- net retail participant flows (YP, PD, XC, etc.), and institutional syndicate accumulation concentration.

CREATE TABLE IF NOT EXISTS retail_herd_index_daily (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  rhi_score NUMERIC(5, 2) NOT NULL DEFAULT 50.00,
  syndicate_asymmetry_ratio NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
  retail_net_buy_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
  retail_participation_ratio NUMERIC(6, 4) NOT NULL DEFAULT 0,
  top3_net_buy_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
  top3_concentration_ratio NUMERIC(6, 4) NOT NULL DEFAULT 0,
  top_retail_buyer VARCHAR(10),
  top_syndicate_buyer VARCHAR(10),
  confluence_regime VARCHAR(40) NOT NULL DEFAULT 'BALANCED_HERD_FLOW',
  conviction_score INTEGER NOT NULL DEFAULT 50,
  advisory TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rhi_emiten_date UNIQUE (emiten, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_rhi_date_regime 
  ON retail_herd_index_daily (trade_date DESC, confluence_regime);

CREATE INDEX IF NOT EXISTS idx_rhi_emiten_date 
  ON retail_herd_index_daily (emiten, trade_date DESC);
