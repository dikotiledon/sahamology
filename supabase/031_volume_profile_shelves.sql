-- Migration 031: Volume Profile Shelves & Intraday Liquidity Distribution Engine
-- Pure quantitative volume-by-price distribution: POC, VAH, VAL, and liquidity shelves.

CREATE TABLE IF NOT EXISTS volume_profile_snapshots (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  as_of_date DATE NOT NULL,
  lookback_days INT NOT NULL DEFAULT 20,
  poc_price NUMERIC(12, 2) NOT NULL,
  vah_price NUMERIC(12, 2) NOT NULL,
  val_price NUMERIC(12, 2) NOT NULL,
  total_volume NUMERIC(20, 0) NOT NULL,
  hvn_shelves JSONB NOT NULL DEFAULT '[]'::jsonb,
  lvn_voids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_volume_profile_emiten_date_lookback UNIQUE (emiten, as_of_date, lookback_days)
);

CREATE INDEX IF NOT EXISTS idx_volume_profile_emiten ON volume_profile_snapshots(emiten, as_of_date);
