-- Daily OHLCV time-series store. One row per emiten per trading day.
-- This is the substrate for the tape filter (Phase 1) and the N-day
-- expectancy baseline; stock_queries remains the per-day analysis snapshot.
CREATE TABLE IF NOT EXISTS price_history (
  emiten TEXT NOT NULL,
  date DATE NOT NULL,
  open NUMERIC,
  high NUMERIC,
  low NUMERIC,
  close NUMERIC,
  volume NUMERIC,
  value NUMERIC,
  frequency INTEGER,
  foreign_buy NUMERIC,
  foreign_sell NUMERIC,
  net_foreign NUMERIC,
  average NUMERIC,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (emiten, date)
);

CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(date);
