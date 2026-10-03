-- Migration 033: Cross-Sector Capital Rotation & Institutional Flow Momentum Matrix
-- Daily sectoral relative strength (RS) vs IHSG, 5d/20d net institutional flow, and rotation quadrants.

CREATE TABLE IF NOT EXISTS sector_rotation_daily (
  id BIGSERIAL PRIMARY KEY,
  sector VARCHAR(50) NOT NULL,
  trade_date DATE NOT NULL,
  rs_ratio NUMERIC(8, 2) NOT NULL,
  rs_momentum NUMERIC(8, 2) NOT NULL,
  net_flow_5d NUMERIC(16, 2) NOT NULL,
  net_flow_20d NUMERIC(16, 2) NOT NULL,
  flow_intensity_pct NUMERIC(6, 2) NOT NULL,
  quadrant VARCHAR(20) NOT NULL,
  constituent_count INT NOT NULL DEFAULT 0,
  top_emiten VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sector_rotation UNIQUE (sector, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_sector_rotation_date ON sector_rotation_daily(trade_date DESC, rs_ratio DESC);
