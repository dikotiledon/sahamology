# Implementation Plan: Phase 21 — Cumulative Volume Delta (CVD), Foreign Tape Aggression & Absorption Engine

> **Status:** APPROVED  
> **Date:** 2026-10-03  
> **Spec Reference:** `docs/superpowers/specs/2026-10-03-cumulative-volume-delta-cvd-design.md`  

---

## 1. Objective & Scope

Implement Phase 21 of Sahamology: **Cumulative Volume Delta (CVD) Proxy, Foreign Tape Aggression & Passive Absorption Engine**.
This engine uncovers the aggressive vs passive market microstructure behind IDX equity transactions:
1. **Bar Volume Delta Proxy Math**: Calculates single-bar delta using Close Location Value (CLV) and Open-to-Close displacement weighting.
2. **Rolling Cumulative Volume Delta (CVD 20d & 50d)**: Accumulates net delta series and normalized delta ratios ($\Delta\%$).
3. **Foreign Tape Aggression Ratio**: Computes institutional market buy vs sell aggression ($\ge 0.65$ HAKA dominance, $\le 0.35$ HAKI dominance).
4. **Order Flow Divergence Detection**: Identifies **Bullish CVD Absorption** (lower price trough + higher CVD trough) and **Bearish CVD Exhaustion** (higher price peak + lower CVD peak).
5. **Confluence Regimes**: Maps interactions into 5 deterministic regimes (`BULLISH_CVD_ABSORPTION`, `AGGRESSIVE_MARKET_MARKUP`, `NEUTRAL_DELTA_ROTATION`, `BEARISH_CVD_EXHAUSTION`, `AGGRESSIVE_MARKET_MARKDOWN`).
6. **Zero-Stance Boundary**: Operates strictly as an order flow confluence overlay without mutating Playbook gates G0–G4.

---

## 2. Proposed Task Breakdown

- [x] **Task 1: Relational Schema Migration `supabase/041_cumulative_volume_delta_daily.sql`**
  - Create table `cumulative_volume_delta_daily` with primary keys, numeric delta metrics, divergence flags, and unique constraint on `(emiten, trade_date)`.
- [x] **Task 2: Core Domain Engine (`lib/cvd/`)**
  - `types.ts`: Define domain types (`CvdAssessment`, `BarDelta`, `CvdMetrics`, `CvdDivergenceType`, `CvdRegime`).
  - `delta-calculator.ts`: Calculate bar volume delta proxies and rolling cumulative volume delta series.
  - `tape-aggression.ts`: Calculate Foreign Tape Aggression Ratio and participant delta.
  - `divergence-detector.ts`: Detect Bullish CVD Absorption and Bearish CVD Exhaustion divergences.
  - `confluence.ts`: Evaluate CVD interaction regime with conviction score (0–100) and advisory.
  - `index.ts`: Master orchestrator `evaluateCumulativeVolumeDelta`.
  - `cvd.test.ts`: Comprehensive unit tests.
- [x] **Task 3: Database Persistence Helpers (`lib/db.ts`)**
  - Implement `saveCvdSnapshot(row)`, `getLatestCvd(emiten, tradeDate?)`, and `getLatestCvdUniverse(tradeDate?)`.
  - Author unit test `lib/cvd-db.test.ts`.
- [x] **Task 4: API Route Handlers**
  - Create `app/api/radar/cvd/route.ts` supporting single emiten (`?emiten=BBRI&date=YYYY-MM-DD`) and universe queries.
  - Author route test `app/api/radar/cvd/route.test.ts`.
- [x] **Task 5: User Interface & Surface Integrations**
  - Create `app/components/CumulativeDeltaCard.tsx` with CVD gauge, foreign aggression bar, divergence indicators, and advisory.
  - Add semantic CSS design tokens in `app/globals.css`.
  - Mount `CumulativeDeltaCard` in `/radar` emiten detail drawer.
  - Enrich `app/api/desk/battle-plan/route.ts` and `BattlePlanCard.tsx` with `📊 CVD: {regime}` badge.
- [x] **Task 6: Walk-Forward Validation Gate**
  - Implement `scripts/run-cvd-walkforward.ts` enforcing $N \ge 30$ sample floor and fail-closed `VERDICT_UNREACHABLE` semantics.
  - Author test `scripts/run-cvd-walkforward.test.ts`.
  - Add `"walkforward:cvd"` to `package.json`.
- [x] **Task 7: Documentation & Verification**
  - Update `CHANGELOG.md` (`v0.25.0 draft`) and `README.md`.
  - Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
  - Git commit and push upstream.
