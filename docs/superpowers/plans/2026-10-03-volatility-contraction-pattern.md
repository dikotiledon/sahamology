# Phase 14: Volatility Contraction Pattern (VCP) & Minervini Trend Template Engine — Implementation Plan

> **Spec Reference:** `docs/superpowers/specs/2026-10-03-volatility-contraction-pattern-design.md`  
> **Status:** COMPLETED  
> **Date:** 2026-10-03  

---

## Task Breakdown

- [x] **Task 1: Schema Migration `supabase/034_vcp_pattern_daily.sql`**
  - Create table `vcp_patterns_daily` tracking `trend_template_passed`, `sma_50`, `sma_150`, `sma_200`, `pct_from_52w_high`, `pct_from_52w_low`, `contraction_count`, `contractions` JSONB, `pivot_price`, `stop_loss_price`, `volume_dry_up_ratio`, `vcp_stage`, and `confluence_tag`.
  - Add unique constraint `(emiten, trade_date)` and index on `(trade_date DESC, vcp_stage)`.

- [x] **Task 2: Core Domain Types & Mathematical Engine (`lib/vcp/`)**
  - Implement `lib/vcp/types.ts` defining `TrendTemplateResult`, `ContractionWave`, `VcpAssessment`, and `VcpStage`.
  - Implement `lib/vcp/trend-template.ts` evaluating Minervini's 6-point Stage 2 criteria on daily bars.
  - Implement `lib/vcp/contraction-detector.ts` detecting 2 to 4 progressive contractions ($T_1 > T_2 > T_3 > T_4$), volume dry-up, cheat pivot price, and tight invalidation stop.
  - Implement `lib/vcp/confluence.ts` evaluating confluence with Brosum AQS ($\ge 65$), Wyckoff phase, and Volume Profile.
  - Implement `lib/vcp/index.ts` exporting unified evaluation functions.
  - Add comprehensive unit test suite in `lib/vcp/vcp.test.ts`.

- [x] **Task 3: Database Persistence Helpers (`lib/db.ts`)**
  - Add `saveVcpPatternSnapshot(row)` upserting into `vcp_patterns_daily`.
  - Add `getLatestVcpSnapshot(emiten, tradeDate)` and `getLatestVcpUniverse(tradeDate)`.
  - Add unit test suite in `lib/vcp-db.test.ts`.

- [x] **Task 4: Next.js API Route Handler (`app/api/radar/vcp/route.ts`)**
  - Support `GET /api/radar/vcp?emiten=BBRI` returning single emiten VCP assessment.
  - Support `GET /api/radar/vcp?date=YYYY-MM-DD` returning active universe VCP candidates.
  - Implement fail-open fallbacks when DB is offline or price history is sparse.
  - Add test suite in `app/api/radar/vcp/route.test.ts`.

- [x] **Task 5: UI Presentation Component & Semantic CSS Tokens**
  - Build `app/components/VcpPatternCard.tsx` with contraction wave visualization, Trend Template checklist pills, and pivot execution box.
  - Add semantic CSS tokens in `app/globals.css` (`.vcp-card`, `.vcp-wave-container`, `.vcp-wave-bar`, `.vcp-pill`, etc.).

- [x] **Task 6: Surface Integrations (`/radar` & `/desk`)**
  - Integrate `VcpPatternCard` into `/radar` (`app/radar/page.tsx`) in the inspection drawer and as a discovery filter.
  - Integrate VCP Pivot badge (`🎯 VCP: Rp X.XXX`) into `BattlePlanCard.tsx` on `/desk`.

- [x] **Task 7: Walk-Forward Validation Gate**
  - Implement `scripts/run-vcp-walkforward.ts` enforcing sample size floor ($N \ge 30$).
  - Add `scripts/run-vcp-walkforward.test.ts` testing `VERDICT_UNREACHABLE`, `PASS`, and `FAIL` conditions.
  - Wire script `"walkforward:vcp"` into `package.json`.

- [x] **Task 8: Verification & Documentation**
  - Verify complete test suite (`npm run test`), lint (`npm run lint`), typecheck (`npm run typecheck`), and build (`npm run build`).
  - Update `CHANGELOG.md` and `README.md`.
