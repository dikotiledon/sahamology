# Implementation Plan: Phase 20 — Corporate Actions, Ex-Date Dividend Arbitrage & Rights Issue Dilution Risk Engine

> **Status:** APPROVED  
> **Date:** 2026-10-03  
> **Spec Reference:** `docs/superpowers/specs/2026-10-03-corporate-actions-dividend-rights-design.md`  

---

## 1. Objective & Scope

Implement Phase 20 of Sahamology: **Corporate Actions, Ex-Date Dividend Arbitrage & Rights Issue Dilution Risk Engine**.
This engine tracks corporate events (Dividends, Rights Issues/HMETD, Stock Splits) and calculates actionable risk/opportunity metrics:
1. **Dividend Trap vs Run-Up Scorer**: Computes Dividend Yield, Historical Ex-Date Drop Ratio, Dividend Trap Risk Score (0–100), and days to Cum Date ($T_{\text{cum}}$).
2. **Pre-Cum Run-Up Strategy**: Flags asymmetric momentum setups ($5 \le T_{\text{cum}} \le 20$ with Brosum $\text{AQS} \ge 65$).
3. **Rights Issue Dilution Analyzer**: Calculates Theoretical Ex-Rights Price ($P_{\text{theoretical}}$), Dilution Ratio, Exercise Discount, and Standby Buyer (Pembeli Siaga) presence.
4. **Confluence Regimes**: Maps interactions into 6 regimes (`PRE_CUM_RUNUP_EXPANSION`, `POST_EX_ABSORPTION_BOUNCE`, `RIGHTS_ISSUE_STANDBY_SECURED`, `DIVIDEND_TRAP_HAZARD`, `UNSECURED_RIGHTS_DILUTION_RISK`, `NEUTRAL_CORPORATE_ACTION`).
5. **Zero-Stance Boundary**: Strictly functions as an event filter and risk mitigator without altering Playbook gates G0–G4.

---

## 2. Proposed Task Breakdown

- [x] **Task 1: Relational Schema Migration `supabase/040_corporate_actions_daily.sql`**
  - Create table `corporate_actions_daily` with primary keys, numeric constraints, JSONB action metadata, and unique constraint on `(emiten, trade_date)`.
- [x] **Task 2: Core Domain Engine (`lib/corporate-action/`)**
  - `types.ts`: Define domain types (`CorporateActionAssessment`, `DividendMetrics`, `RightsIssueMetrics`, `CorpActionRegime`, `ActionType`).
  - `dividend-scorer.ts`: Calculate dividend yield, ex-date drop ratio, trap risk score, and pre-cum run-up window.
  - `rights-analyzer.ts`: Calculate theoretical ex-rights price, dilution percentage, and standby buyer evaluation.
  - `confluence.ts`: Evaluate corporate action regime with score and advisory.
  - `index.ts`: Master orchestrator `evaluateCorporateActions`.
  - `corporate-action.test.ts`: Comprehensive unit tests.
- [x] **Task 3: Database Persistence Helpers (`lib/db.ts`)**
  - Implement `saveCorpActionSnapshot(row)`, `getLatestCorpAction(emiten, tradeDate?)`, and `getLatestCorpActionUniverse(tradeDate?)`.
  - Author unit test `lib/corporate-action-db.test.ts`.
- [x] **Task 4: API Route Handlers**
  - Create `app/api/radar/corporate-actions/route.ts` supporting single emiten (`?emiten=BBRI&date=YYYY-MM-DD`) and universe queries.
  - Author route test `app/api/radar/corporate-actions/route.test.ts`.
- [x] **Task 5: User Interface & Surface Integrations**
  - Create `app/components/CorporateActionsCard.tsx` with dividend trap score gauge, event dates timeline, rights issue dilution details, and advisory.
  - Add semantic CSS design tokens in `app/globals.css`.
  - Mount `CorporateActionsCard` in `/radar` emiten detail drawer.
  - Enrich `app/api/desk/battle-plan/route.ts` and `BattlePlanCard.tsx` with `📅 Action: {regime}` badge.
- [x] **Task 6: Walk-Forward Validation Gate**
  - Implement `scripts/run-corporate-actions-walkforward.ts` enforcing $N \ge 30$ sample floor and fail-closed `VERDICT_UNREACHABLE` semantics.
  - Author test `scripts/run-corporate-actions-walkforward.test.ts`.
  - Add `"walkforward:corp"` to `package.json`.
- [x] **Task 7: Documentation & Verification**
  - Update `CHANGELOG.md` (`v0.24.0 draft`) and `README.md`.
  - Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
  - Git commit and push upstream.
