# Phase 15: IDX Market Breadth & Composite Liquidity Engine (IHSG Pulse) — Implementation Plan

> **Spec Reference:** `docs/superpowers/specs/2026-10-03-market-breadth-composite-liquidity-design.md`  
> **Status:** COMPLETED  
> **Date:** 2026-10-03  

---

## Task Breakdown

- [x] **Task 1: Schema Migration `supabase/035_market_breadth_daily.sql`**
  - Create table `market_breadth_daily` tracking `trade_date`, `advancers`, `decliners`, `unchanged`, `ad_ratio`, `pct_above_ema20`, `pct_above_sma50`, `pct_above_sma200`, `new_highs_52w`, `new_lows_52w`, `net_foreign_flow`, `market_regime`, `regime_score`, `constituent_count`, and `advisory`.
  - Add unique constraint on `trade_date` and index on `(trade_date DESC, market_regime)`.

- [x] **Task 2: Core Domain Types & Mathematical Engine (`lib/breadth/`)**
  - Implement `lib/breadth/types.ts` defining `MarketBreadthMetric`, `MarketRegime`, and `BreadthConstituent`.
  - Implement `lib/breadth/calculator.ts` calculating Advance/Decline counts, moving average participation percentages ($> \text{EMA}_{20}$, $> \text{SMA}_{50}$, $> \text{SMA}_{200}$), and 52-week High/Low expansion.
  - Implement `lib/breadth/regime-classifier.ts` mapping breadth metrics to the 5 market regimes (`BULLISH_EXPANSION`, `HEALTHY_PULLBACK`, `BREADTH_DIVERGENCE_WARNING`, `BEARISH_DISTRIBUTION`, `OVERSOLD_CAPITULATION`).
  - Implement `lib/breadth/index.ts` exporting unified calculation functions.
  - Add comprehensive unit test suite in `lib/breadth/breadth.test.ts`.

- [x] **Task 3: Database Persistence Helpers (`lib/db.ts`)**
  - Add `saveMarketBreadthSnapshot(row)` upserting into `market_breadth_daily`.\n  - Add `getLatestMarketBreadthSnapshot(tradeDate)` and `getMarketBreadthHistory(limit)`.
  - Add unit test suite in `lib/breadth-db.test.ts`.

- [x] **Task 4: Next.js API Route Handler (`app/api/radar/breadth/route.ts`)**
  - Support `GET /api/radar/breadth?date=YYYY-MM-DD` returning daily market breadth metrics and regime advisory.
  - Implement fail-open defaults when database is unconfigured.
  - Add test suite in `app/api/radar/breadth/route.test.ts`.

- [x] **Task 5: UI Presentation Component & Semantic CSS Tokens**
  - Build `app/components/MarketBreadthCard.tsx` with Advance/Decline meter, moving average breadth progress bars, and regime advisory alert.
  - Add semantic CSS tokens in `app/globals.css` (`.breadth-card`, `.breadth-meter`, `.breadth-bar`, `.breadth-regime-pill`, etc.).

- [x] **Task 6: Surface Integrations (`/desk` & `/radar`)**
  - Mount `MarketBreadthCard` in `/desk` (`app/desk/page.tsx`) as top market environment pulse.
  - Mount `MarketBreadthCard` in `/radar` (`app/radar/page.tsx`) in market context view.

- [x] **Task 7: Walk-Forward Validation Gate**
  - Implement `scripts/run-market-breadth-walkforward.ts` enforcing sample size floor ($N \ge 30$).
  - Add `scripts/run-market-breadth-walkforward.test.ts` testing `VERDICT_UNREACHABLE`, `PASS`, and `FAIL` conditions.
  - Wire script `"walkforward:breadth"` into `package.json`.

- [x] **Task 8: Verification & Documentation**
  - Verify complete test suite (`npm run test`), lint (`npm run lint`), typecheck (`npm run typecheck`), and build (`npm run build`).
  - Update `CHANGELOG.md` and `README.md`.
