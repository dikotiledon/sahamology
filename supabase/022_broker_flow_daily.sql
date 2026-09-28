-- Phase 2 (plan D3): per-broker, per-session flow for the BAND's own code.
--
-- Rationale (D3): band flow has NEVER been persisted, so G1's flow upgrade
-- cannot be replayed. This is a NEW TABLE rather than columns on stock_queries
-- or price_history because the grain differs: this is per
-- (emiten, date, broker_code), while stock_queries is per (emiten, date) and
-- price_history is per (emiten, date) OHLCV. Plan Option H rejected mixing
-- the grains.
--
-- Only the band's own code is stored (D4). `pickTopBrokerCodes` returns the
-- top-N by |net value| and the route caps at 7, so the band's code is NOT
-- guaranteed to be in the set; scoring another broker's flow as the band's is
-- a category error (P2-E).
--
-- `broker_seen_in_detector` (D20) records whether the code appeared in that
-- session's marketdetectors `brokers` list. A row is only ever written when
-- it is true. Without it, a broker that was simply absent that day (or active
-- only on the negotiated board) would be persisted as a legitimate zero-flow
-- row and later read by D9's `net_value < 0` rule as distribution.

CREATE TABLE IF NOT EXISTS broker_flow_daily (
  emiten                 TEXT        NOT NULL,
  date                   DATE        NOT NULL,
  broker_code            TEXT        NOT NULL,
  net_value              NUMERIC,
  buy_days               INTEGER,
  active_days            INTEGER,
  consistency_pct        NUMERIC,
  broker_seen_in_detector BOOLEAN    NOT NULL DEFAULT FALSE,
  synced_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (emiten, date, broker_code)
);

-- Replay reads "the flow window for this broker as of this session".
CREATE INDEX IF NOT EXISTS idx_broker_flow_daily_code_date
  ON broker_flow_daily (emiten, broker_code, date);
