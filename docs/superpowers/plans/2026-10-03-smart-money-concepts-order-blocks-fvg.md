# Implementation Plan: Phase 17 — Institutional Order Blocks, Fair Value Gaps (FVG) & Liquidity Sweep Engine

> **Status:** APPROVED  
> **Date:** 2026-10-03  
> **Spec Reference:** `docs/superpowers/specs/2026-10-03-smart-money-concepts-order-blocks-fvg-design.md`  

---

## 1. Objective & Scope

Implement Phase 17 of Sahamology: **Institutional Order Blocks, Fair Value Gaps (FVG) & Liquidity Sweep Engine (Smart Money Concepts for IDX)**.
This engine extracts high-probability institutional footprints from daily price bars:
1. **Swing Pivots & Market Structure**: Identifies Swing Highs/Lows and classifies Break of Structure (BOS) vs. Change of Character (CHoCH).
2. **Order Blocks (OB)**: Locates origin institutional base candles that launched structural breaks, tracking unmitigated vs. mitigated zones.
3. **Fair Value Gaps (FVG / Imbalances)**: Detects 3-bar liquidity voids with 50% Consequent Encroachment (CE) magnetic targets.
4. **Liquidity Sweeps (Turtle Soup)**: Flags aggressive wicks below swing lows that reclaim prior ranges with institutional absorption.
5. **Confluence & Tactical Advisory**: Evaluates multi-factor structure alignment into 5 deterministic regimes (`PRIME_ORDER_BLOCK_DEFENSE`, `BOS_BULLISH_EXPANSION`, `LIQUIDITY_SWEEP_REVERSAL`, `FVG_REBALANCING_PULLBACK`, `BEARISH_STRUCTURE_CHOCH`).
6. **Zero-Stance Boundary**: Strictly provides discovery filters and execution entry/stop refinements without bypassing Playbook gates G0–G4.

---

## 2. Proposed Task Breakdown

- [x] **Task 1: Relational Schema Migration `supabase/037_smart_money_structure_daily.sql`**
  - Create table `smart_money_structure_daily` with primary keys, numeric constraints, JSONB zone metadata, and unique constraint on `(emiten, trade_date)`.
- [x] **Task 2: Core Domain Engine (`lib/smc/`)**
  - `types.ts`: Define domain types (`SmartMoneyAssessment`, `OrderBlockZone`, `FairValueGapZone`, `LiquiditySweepEvent`, `MarketStructureType`, `SmcRegime`).
  - `swing-detector.ts`: Detect confirmed swing pivots ($k=2$), BOS, and CHoCH events.
  - `order-block-detector.ts`: Detect Bullish/Bearish Order Blocks and compute mitigation status.
  - `fvg-detector.ts`: Detect 3-bar Fair Value Gaps, calculate 50% Consequent Encroachment (CE), and verify mitigation.
  - `sweep-detector.ts`: Identify stop-run liquidity sweeps on swing lows/highs.
  - `confluence.ts`: Classify SMC interaction regime and compute composite score ($0-100$).
  - `index.ts`: Master orchestrator `evaluateSmartMoneyStructure`.
  - `smc.test.ts`: Comprehensive unit tests verifying each component and edge cases.
- [x] **Task 3: Database Persistence Helpers (`lib/db.ts`)**
  - Implement `saveSmartMoneySnapshot(row)`, `getLatestSmartMoney(emiten, tradeDate?)`, and `getLatestSmartMoneyUniverse(tradeDate?)`.
  - Author unit test `lib/smc-db.test.ts`.
- [x] **Task 4: API Route Handlers**
  - Create `app/api/radar/smc/route.ts` supporting single emiten (`?emiten=BBRI&date=YYYY-MM-DD`) and universe queries.
  - Author route test `app/api/radar/smc/route.test.ts`.
- [x] **Task 5: User Interface & Surface Integrations**
  - Create `app/components/SmartMoneyCard.tsx` with visual zone representations, structure badges, and mitigation pills.
  - Add semantic CSS design tokens in `app/globals.css`.
  - Mount `SmartMoneyCard` in `/radar` emiten detail drawer.
  - Enrich `app/api/desk/battle-plan/route.ts` and `BattlePlanCard.tsx` with `🧱 OB: Rp X-Y` and `⚡ FVG: Rp X-Y` badges.
- [x] **Task 6: Walk-Forward Validation Gate**
  - Implement `scripts/run-smc-walkforward.ts` enforcing $N \ge 30$ sample floor and fail-closed `VERDICT_UNREACHABLE` semantics.
  - Author test `scripts/run-smc-walkforward.test.ts`.
  - Add `"walkforward:smc"` to `package.json`.
- [x] **Task 7: Documentation & Verification**
  - Update `CHANGELOG.md` (`v0.21.0 draft`) and `README.md`.
  - Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
  - Git commit and push upstream.
