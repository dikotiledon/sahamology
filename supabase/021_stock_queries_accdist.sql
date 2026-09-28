-- Phase 2 (plan D3): acc/dist + broker count columns on stock_queries.
--
-- Rationale (D3): acc/dist has NEVER been persisted, so G1's acc/dist upgrade
-- has no schema to read. Every column is nullable and there is NO backfill
-- UPDATE: the vendor block is only available prospectively (there is no
-- historical orderbook and `bandar_detector` over a multi-day range is
-- UNVERIFIED — root gate G1). Backfilling would fabricate the entire upgrade.
--
-- Exactly the 8 D3 columns. The cycle-1 additions (D18/D20) live in 023 so
-- this file stays a faithful expression of the original D3 decision.

ALTER TABLE stock_queries ADD COLUMN IF NOT EXISTS accdist_overall   TEXT;
ALTER TABLE stock_queries ADD COLUMN IF NOT EXISTS accdist_top1     TEXT;
ALTER TABLE stock_queries ADD COLUMN IF NOT EXISTS accdist_top3     TEXT;
ALTER TABLE stock_queries ADD COLUMN IF NOT EXISTS accdist_top5     TEXT;
ALTER TABLE stock_queries ADD COLUMN IF NOT EXISTS accdist_avg      TEXT;
ALTER TABLE stock_queries ADD COLUMN IF NOT EXISTS broker_total_buyer  INTEGER;
ALTER TABLE stock_queries ADD COLUMN IF NOT EXISTS broker_total_seller INTEGER;
ALTER TABLE stock_queries ADD COLUMN IF NOT EXISTS broker_p        NUMERIC;
