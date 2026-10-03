# Implementation Plan: Phase 22 — Retail Herd Dispersion, Broker Concentration & Syndicate Asymmetry Engine

> **Status:** APPROVED  
> **Date:** 2026-10-03  
> **Spec Reference:** `docs/superpowers/specs/2026-10-03-retail-herd-syndicate-concentration-design.md`  

---

## 1. Objective & Scope

Implement Phase 22 of Sahamology: **Retail Herd Dispersion, Broker Concentration & Syndicate Asymmetry Engine (Retail Herd Index / RHI)**.
This engine measures retail crowding versus institutional syndicate concentration on the Indonesia Stock Exchange:
1. **Retail vs. Whale Broker Classification**: Categorizes active IDX broker codes into retail discount brokers (`YP`, `PD`, `XC`, `NI`, `CC`, `GR`, `XL`) vs. institutional foreign/domestic whales (`AK`, `BK`, `CS`, `RX`, `ZP`, `KZ`, `CG`, `LG`).
2. **Syndicate Asymmetry Ratio (SAR)**: Calculates the ratio of Top 3 institutional buyers against net retail buying volume.
3. **Retail Herd Index (RHI: 0–100)**: Normalizes retail order crowding and detects **Retail Herd FOMO Traps** ($\ge 75$) vs. **Institutional Stealth Accumulation** ($\le 30$).
4. **Confluence Regimes**: Maps order flow profiles into 5 regimes (`INSTITUTIONAL_STEALTH_ACCUMULATION`, `SYNDICATE_DOMINANT_FLOW`, `BALANCED_HERD_FLOW`, `RETAIL_HERD_FOMO_TRAP`, `RETAIL_PANIC_CAPITULATION`).
5. **Zero-Stance Boundary**: Operates strictly as an order flow filter and trap mitigator without altering Playbook gates G0–G4.

---

## 2. Proposed Task Breakdown

- [x] **Task 1: Relational Schema Migration `supabase/042_retail_herd_index_daily.sql`**
  - Create table `retail_herd_index_daily` with primary keys, numeric RHI metrics, broker concentration ratios, and unique constraint on `(emiten, trade_date)`.
- [x] **Task 2: Core Domain Engine (`lib/rhi/`)**
  - `types.ts`: Define domain types (`RhiAssessment`, `BrokerParticipation`, `RetailMetrics`, `SyndicateMetrics`, `RhiRegime`).
  - `broker-classifier.ts`: Classify retail vs. institutional broker codes and calculate net retail turnover.
  - `rhi-calculator.ts`: Calculate Retail Herd Index, Syndicate Asymmetry Ratio, and Top-3 concentration.
  - `confluence.ts`: Evaluate RHI interaction regime with conviction score (0–100) and advisory.
  - `index.ts`: Master orchestrator `evaluateRetailHerdIndex`.
  - `rhi.test.ts`: Comprehensive unit tests.
- [x] **Task 3: Database Persistence Helpers (`lib/db.ts`)**
  - Implement `saveRhiSnapshot(row)`, `getLatestRhi(emiten, tradeDate?)`, and `getLatestRhiUniverse(tradeDate?)`.
  - Author unit test `lib/rhi-db.test.ts`.
- [x] **Task 4: API Route Handlers**
  - Create `app/api/radar/rhi/route.ts` supporting single emiten (`?emiten=BBRI&date=YYYY-MM-DD`) and universe queries.
  - Author route test `app/api/radar/rhi/route.test.ts`.
- [x] **Task 5: User Interface & Surface Integrations**
  - Create `app/components/RetailHerdCard.tsx` with RHI gauge, syndicate vs retail breakdown bar, and advisory.
  - Add semantic CSS design tokens in `app/globals.css`.
  - Mount `RetailHerdCard` in `/radar` emiten detail drawer.
  - Enrich `app/api/desk/battle-plan/route.ts` and `BattlePlanCard.tsx` with `👥 RHI: {regime}` badge.
- [x] **Task 6: Walk-Forward Gate**
  - Implement `scripts/run-rhi-walkforward.ts` enforcing $N \ge 30$ sample floor and fail-closed `VERDICT_UNREACHABLE` semantics.
  - Author test `scripts/run-rhi-walkforward.test.ts`.
  - Add `"walkforward:rhi"` to `package.json`.
- [x] **Task 7: Documentation & Verification**
  - Update `CHANGELOG.md` (`v0.26.0 draft`) and `README.md`.
  - Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
  - Git commit and push upstream.
