# Phase 16: Anchored VWAP (AVWAP) & Institutional Broker Benchmark Engine — Implementation Plan

> **Spec Reference:** `docs/superpowers/specs/2026-10-03-anchored-vwap-broker-benchmark-design.md`  
> **Status:** COMPLETED  
> **Date:** 2026-10-03  

---

## Task Breakdown

- [x] **Task 1: Schema Migration `supabase/036_anchored_vwap_daily.sql`**
  - Create table `anchored_vwap_daily` tracking `emiten`, `trade_date`, `base_avwap`, `base_upper_band_1sd`, `base_lower_band_1sd`, `base_upper_band_2sd`, `base_lower_band_2sd`, `volume_climax_avwap`, `high_52w_avwap`, `bandar_vwap_top3`, `bandar_vwap_top5`, `confluence_regime`, `advisory`, and anchor metadata JSONB.
  - Add unique constraint on `(emiten, trade_date)` and index on `(trade_date DESC, confluence_regime)`.

- [x] **Task 2: Core Domain Types & Mathematical Engine (`lib/vwap/`)**
  - Implement `lib/vwap/types.ts` defining `AnchoredVwapResult`, `VwapBand`, `VwapConfluenceRegime`, and `PriceBar`.
  - Implement `lib/vwap/avwap-calculator.ts` calculating volume-weighted average price and volume-weighted standard deviation channels ($\pm 1\sigma, \pm 2\sigma$) from arbitrary anchor points.
  - Implement `lib/vwap/bandar-benchmark.ts` deriving institutional Bandar VWAP from top accumulating broker summary records.
  - Implement `lib/vwap/confluence.ts` evaluating price position against multi-anchor levels into 5 interaction regimes (`AT_INSTITUTIONAL_DEFENSE`, `ABOVE_ALL_ANCHORS_EXPANSION`, `OVEREXTENDED_VALUE_EXHAUSTION`, `TRAPPED_BELOW_CLIMAX`, `INSTITUTIONAL_CAPITULATION_BREAKDOWN`).
  - Implement `lib/vwap/index.ts` exporting unified calculation functions.
  - Add comprehensive unit test suite in `lib/vwap/avwap.test.ts`.

- [x] **Task 3: Database Persistence Helpers (`lib/db.ts`)**
  - Add `saveAnchoredVwapSnapshot(row)` upserting into `anchored_vwap_daily`.
  - Add `getLatestAnchoredVwap(emiten, tradeDate?)` and `getLatestAnchoredVwapUniverse(tradeDate?)`.
  - Add unit test suite in `lib/avwap-db.test.ts`.

- [x] **Task 4: Next.js API Route Handler (`app/api/radar/avwap/route.ts`)**
  - Support `GET /api/radar/avwap?emiten=BBRI&date=YYYY-MM-DD` returning AVWAP levels and confluence regime.
  - Support `GET /api/radar/avwap` returning universe list.
  - Implement fail-open defaults with runtime calculation from price history when database snapshot is missing.
  - Add test suite in `app/api/radar/avwap/route.test.ts`.

- [x] **Task 5: UI Presentation Component & Semantic CSS Tokens**
  - Build `app/components/AnchoredVwapCard.tsx` featuring visual AVWAP level gauges, volatility channels ($\pm 1\sigma, \pm 2\sigma$), Bandar VWAP benchmark comparison, and tactical confluence alerts.
  - Add semantic CSS tokens in `app/globals.css` (`.avwap-card`, `.avwap-gauge`, `.avwap-band-pill`, etc.).

- [x] **Task 6: Surface Integrations (`/radar` & `/desk`)**
  - Mount `AnchoredVwapCard` in `/radar` (`app/radar/page.tsx`) emiten inspection drawer.
  - Integrate AVWAP badge (`⚓ AVWAP: Rp X.XXX`) into `BattlePlanCard.tsx` and `app/api/desk/battle-plan/route.ts`.

- [x] **Task 7: Walk-Forward Validation Gate**
  - Implement `scripts/run-avwap-walkforward.ts` enforcing sample size floor ($N \ge 30$).
  - Add `scripts/run-avwap-walkforward.test.ts` testing `VERDICT_UNREACHABLE`, `PASS`, and `FAIL` conditions.
  - Wire script `"walkforward:avwap"` into `package.json`.

- [x] **Task 8: Verification & Documentation**
  - Verify complete test suite (`npm run test`), lint (`npm run lint`), typecheck (`npm run typecheck`), and build (`npm run build`).
  - Update `CHANGELOG.md` and `README.md`.
