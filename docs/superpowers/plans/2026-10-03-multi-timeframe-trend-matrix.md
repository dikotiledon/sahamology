# Implementation Plan: Phase 18 — Multi-Timeframe Alignment & Institutional Trend Matrix

> **Status:** APPROVED  
> **Date:** 2026-10-03  
> **Spec Reference:** `docs/superpowers/specs/2026-10-03-multi-timeframe-trend-matrix-design.md`  

---

## 1. Objective & Scope

Implement Phase 18 of Sahamology: **Multi-Timeframe Alignment & Institutional Trend Matrix (Triple Screen & Weinstein Stages for IDX)**.
This engine systematically aligns macro weekly secular trends with intermediate daily tactical setups:
1. **Synthetic Weekly Bar Aggregation**: Aggregates daily trading history into structured calendar weekly bars.
2. **Weekly Screen (The Tide)**: Calculates $\text{EMA}_{10\text{w}}$, $\text{EMA}_{30\text{w}}$, 30-week moving average slope, and classifies Weinstein Stages 1 through 4 (`STAGE_1_BASING`, `STAGE_2_EXPANSION`, `STAGE_3_DISTRIBUTION`, `STAGE_4_CAPITULATION`).
3. **Daily Screen (The Wave)**: Evaluates daily market structure, $\text{EMA}_{20}$, $\text{SMA}_{50}$, and $\text{SMA}_{200}$ trend alignment.
4. **Alignment Matrix & Sizing Scaler**: Maps multi-timeframe interactions into 6 deterministic regimes (`PERFECT_TIDE_ALIGNMENT`, `HIGH_PROBABILITY_PULLBACK`, `RANGE_BOUND_COMPRESSION`, `COUNTER_TREND_TRAP_HAZARD`, `SECULAR_LIQUIDATION`, `MIXED_TRANSITION`) and assigns position sizing multipliers ($0.00\times$ to $1.00\times$).
5. **Zero-Stance Boundary**: Strictly provides discovery filters and execution entry/stop refinements without bypassing Playbook gates G0–G4.

---

## 2. Proposed Task Breakdown

- [x] **Task 1: Relational Schema Migration `supabase/038_multi_timeframe_matrix_daily.sql`**
  - Create table `multi_timeframe_matrix_daily` with primary keys, numeric constraints, JSONB weekly metrics, and unique constraint on `(emiten, trade_date)`.
- [x] **Task 2: Core Domain Engine (`lib/mtf/`)**
  - `types.ts`: Define domain types (`MtfAssessment`, `WeeklyBar`, `WeeklyMetrics`, `DailyMetrics`, `MtfRegime`, `WeinsteinStage`).
  - `weekly-aggregator.ts`: Aggregate daily price bars into ISO weekly bars.
  - `weekly-analyzer.ts`: Calculate weekly EMAs, slope, and Weinstein Stage.
  - `daily-analyzer.ts`: Calculate daily moving averages and trend state.
  - `alignment-matrix.ts`: Synthesize weekly and daily states into alignment regime, score, and sizing multiplier.
  - `index.ts`: Master orchestrator `evaluateMultiTimeframeAlignment`.
  - `mtf.test.ts`: Comprehensive unit tests.
- [x] **Task 3: Database Persistence Helpers (`lib/db.ts`)**
  - Implement `saveMtfSnapshot(row)`, `getLatestMtf(emiten, tradeDate?)`, and `getLatestMtfUniverse(tradeDate?)`.
  - Author unit test `lib/mtf-db.test.ts`.
- [x] **Task 4: API Route Handlers**
  - Create `app/api/radar/mtf/route.ts` supporting single emiten (`?emiten=BBRI&date=YYYY-MM-DD`) and universe queries.
  - Author route test `app/api/radar/mtf/route.test.ts`.
- [x] **Task 5: User Interface & Surface Integrations**
  - Create `app/components/MultiTimeframeCard.tsx` with weekly stage visualization, daily wave indicators, and sizing multiplier pill.
  - Add semantic CSS design tokens in `app/globals.css`.
  - Mount `MultiTimeframeCard` in `/radar` emiten detail drawer.
  - Enrich `app/api/desk/battle-plan/route.ts` and `BattlePlanCard.tsx` with `🌊 MTF: {regime}` badge and sizing recommendation.
- [x] **Task 6: Walk-Forward Validation Gate**
  - Implement `scripts/run-mtf-walkforward.ts` enforcing $N \ge 30$ sample floor and fail-closed `VERDICT_UNREACHABLE` semantics.
  - Author test `scripts/run-mtf-walkforward.test.ts`.
  - Add `"walkforward:mtf"` to `package.json`.
- [x] **Task 7: Documentation & Verification**
  - Update `CHANGELOG.md` (`v0.22.0 draft`) and `README.md`.
  - Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
  - Git commit and push upstream.
