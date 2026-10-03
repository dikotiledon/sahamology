-- Migration 036: Anchored VWAP (AVWAP) & Institutional Broker Benchmark Engine
-- Tracks volume-weighted average prices from structural anchor points (Accumulation Base, Climax Bar, 52w High)
-- and multi-day broker summary benchmarks (Bandar VWAP Top 3 / Top 5).

CREATE TABLE IF NOT EXISTS anchored_vwap_daily (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  base_avwap NUMERIC(12, 2) NOT NULL,
  base_upper_band_1sd NUMERIC(12, 2),
  base_lower_band_1sd NUMERIC(12, 2),
  base_upper_band_2sd NUMERIC(12, 2),
  base_lower_band_2sd NUMERIC(12, 2),
  volume_climax_avwap NUMERIC(12, 2),
  high_52w_avwap NUMERIC(12, 2),
  bandar_vwap_top3 NUMERIC(12, 2),
  bandar_vwap_top5 NUMERIC(12, 2),
  confluence_regime VARCHAR(40) NOT NULL,
  regime_score INT NOT NULL DEFAULT 50,
  advisory TEXT,
  anchor_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_anchored_vwap_emiten_date UNIQUE (emiten, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_avwap_date_regime ON anchored_vwap_daily(trade_date DESC, confluence_regime);
CREATE INDEX IF NOT EXISTS idx_avwap_emiten_date ON anchored_vwap_daily(emiten, trade_date DESC);
