# Implementation Plan: Phase 19 — Opening Range Breakout (ORB) & Intraday Initial Balance (IB) Engine

> **Status:** APPROVED  
> **Date:** 2026-10-03  
> **Spec Reference:** `docs/superpowers/specs/2026-10-03-opening-range-breakout-initial-balance-design.md`  

---

## 1. Objective & Scope

Implement Phase 19 of Sahamology: **Opening Range Breakout (ORB) & Intraday Initial Balance (IB) Engine**.
This engine tracks the opening auction and early continuous trading parameters (09:00–09:15 WIB $IB_{15}$ and 09:00–10:00 WIB $IB_{60}$):
1. **Initial Balance Quant**: Calculates $IB_{15}$ and $IB_{60}$ High, Low, Range, and Midpoint, linking directly to the $V_{15m}$ volume participation rule from Pre-Market Battle Plans.
2. **Range Extensions**: Projects institutional liquidity targets ($R_1 = +0.50 \times IB$, $R_2 = +1.00 \times IB$, $S_1 = -0.50 \times IB$, $S_2 = -1.00 \times IB$).
3. **Market Day Classifier**: Classifies trading behavior using the Steidlmayer framework (`TREND_DAY_EXPANSION`, `NORMAL_VARIATION_DAY`, `FAILED_BREAKOUT_TRAP`, `NEUTRAL_ROTATIONAL_DAY`).
4. **Confluence Regimes**: Maps price interactions into 6 regimes (`ORB_BULLISH_EXPANSION`, `ORB_PULLBACK_RETEST`, `INSIDE_IB_COILING`, `ORB_FALSE_BREAKOUT_TRAP`, `ORB_BEARISH_BREAKDOWN`, `NEUTRAL_IB`) with conviction score (0–100).
5. **Zero-Stance Boundary**: Provides timing and precision triggers without altering Playbook gates G0–G4.

---

## 2. Proposed Task Breakdown

- [x] **Task 1: Relational Schema Migration `supabase/039_opening_range_breakout_daily.sql`**
  - Create table `opening_range_breakout_daily` with primary keys, numeric constraints, JSONB level definitions, and unique constraint on `(emiten, trade_date)`.
- [x] **Task 2: Core Domain Engine (`lib/orb/`)**
  - `types.ts`: Define domain types (`OrbAssessment`, `InitialBalanceLevels`, `OrbRegime`, `DayType`, `IntradayBar`).
  - `ib-calculator.ts`: Calculate 15m and 60m Initial Balance high/low/range/midpoint and extension levels ($R_1, R_2, S_1, S_2$).
  - `day-classifier.ts`: Classify Steidlmayer market day types.
  - `confluence.ts`: Evaluate ORB interaction regime with score and advisory.
  - `index.ts`: Master orchestrator `evaluateOpeningRangeBreakout`.
  - `orb.test.ts`: Comprehensive unit tests.
- [x] **Task 3: Database Persistence Helpers (`lib/db.ts`)**
  - Implement `saveOrbSnapshot(row)`, `getLatestOrb(emiten, tradeDate?)`, and `getLatestOrbUniverse(tradeDate?)`.
  - Author unit test `lib/orb-db.test.ts`.
- [x] **Task 4: API Route Handlers**
  - Create `app/api/radar/orb/route.ts` supporting single emiten (`?emiten=BBRI&date=YYYY-MM-DD`) and universe queries.
  - Author route test `app/api/radar/orb/route.test.ts`.
- [x] **Task 5: User Interface & Surface Integrations**
  - Create `app/components/OpeningRangeCard.tsx` with Initial Balance gauge, extensions, day type pill, and advisory.
  - Add semantic CSS design tokens in `app/globals.css`.
  - Mount `OpeningRangeCard` in `/radar` emiten detail drawer.
  - Enrich `app/api/desk/battle-plan/route.ts` and `BattlePlanCard.tsx` with `⚡ ORB: Rp X-Y (IB15)` badge.
- [x] **Task 6: Walk-Forward Validation Gate**
  - Implement `scripts/run-orb-walkforward.ts` enforcing $N \ge 30$ sample floor and fail-closed `VERDICT_UNREACHABLE` semantics.
  - Author test `scripts/run-orb-walkforward.test.ts`.
  - Add `"walkforward:orb"` to `package.json`.
- [x] **Task 7: Documentation & Verification**
  - Update `CHANGELOG.md` (`v0.23.0 draft`) and `README.md`.
  - Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
  - Git commit and push upstream.
