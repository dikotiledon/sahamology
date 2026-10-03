# Phase 13: Cross-Sector Capital Rotation & Institutional Flow Momentum Matrix Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using strict TDD (write failing test first, run test to verify failure, implement minimal code, verify test passes, then commit). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship Phase 13 (Cross-Sector Capital Rotation & Institutional Flow Momentum Matrix) for Sahamology, providing benchmark-relative strength ($RS$) against IHSG, 5d/20d sectoral institutional net flow aggregation, RRG-adapted institutional quadrant classification (`LEADING`, `WEAKENING`, `LAGGING`, `IMPROVING`), and sector tailwind/headwind execution confluence for `/radar` and `/desk`.

**Architecture:** Pure mathematical engine under `lib/sector/`, persisted in PostgreSQL via `supabase/033_sector_rotation_flow.sql`. Exposed via `GET /api/radar/sectors/rotation`, rendered via `SectorRotationMatrixCard.tsx` with semantic design tokens in `app/globals.css`. Preserves zero-stance boundary invariants (G0–G4 remain unmutated).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), PostgreSQL 16 (native `pg`), Tailwind-free semantic CSS in `globals.css`, Node test runner (`tsx --test`).

**Spec:** `docs/superpowers/specs/2026-10-03-sector-rotation-flow-matrix-design.md`

---

## Global Constraints & Invariants
- **Zero-Stance Boundary**: Sector Rotation is strictly an execution confluence overlay and discovery filter; it must **never** mutate Playbook Decision Card gates ($G0$–$G4$) or live trading stances (`ENTER`/`WAIT`/`AVOID`).
- **Zero External API Strain**: Aggregates purely over stored historical daily prices (`price_history`) and daily flow metrics (`broker_flow_daily`) in PostgreSQL; zero external API requests.
- **Fail-Open Fallback**: Unmapped sectors or sparse histories fail open to `SECTOR_NEUTRAL` without throwing errors.

---

### Task 1: Database Migration `033_sector_rotation_flow.sql` & Persistence Helpers

**Files:**
- Create: `supabase/033_sector_rotation_flow.sql`
- Modify: `lib/db.ts`
- Create: `lib/sector-db.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write migration SQL and DB persistence helpers**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: Core Domain Types, Relative Strength Math & Matrix Classifier

**Files:**
- Create: `lib/sector/types.ts`
- Create: `lib/sector/relative-strength.ts`
- Create: `lib/sector/matrix-classifier.ts`
- Create: `lib/sector/index.ts`
- Create: `lib/sector/sector.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement RS ratio, momentum, flow aggregation, and quadrant classification**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: API Route Handler `GET /api/radar/sectors/rotation`

**Files:**
- Create: `app/api/radar/sectors/rotation/route.ts`
- Create: `app/api/radar/sectors/rotation/route.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement GET handler with database caching & fallback**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: UI Visual Component `SectorRotationMatrixCard.tsx` & Semantic Design Tokens

**Files:**
- Create: `app/components/SectorRotationMatrixCard.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Implement quadrant visualization, RS metrics grid, and sector flow tables**
- [ ] **Step 2: Add semantic CSS design tokens in `app/globals.css`**
- [ ] **Step 3: Verify clean layout and no undefined tokens**
- [ ] **Step 4: Commit**

---

### Task 5: Integration into `/radar` and `/desk` Battle Plan

**Files:**
- Modify: `app/radar/page.tsx`
- Modify: `app/components/BattlePlanCard.tsx`

- [ ] **Step 1: Embed SectorRotationMatrixCard into Radar discovery surface**
- [ ] **Step 2: Add Sector Tailwind/Headwind pill in BattlePlanCard**
- [ ] **Step 3: Verify with typecheck, lint, and build**
- [ ] **Step 4: Commit**

---

### Task 6: Walk-Forward Sector Rotation Evaluator & End-to-End Verification

**Files:**
- Create: `scripts/run-sector-rotation-walkforward.ts`
- Create: `scripts/run-sector-rotation-walkforward.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Implement walk-forward sample evaluator with $N \ge 30$ sample floor**
- [ ] **Step 2: Add `npm run walkforward:sector` to `package.json`**
- [ ] **Step 3: Run canonical verification suite (`typecheck`, `lint`, `test`, `build`)**
- [ ] **Step 4: Commit and push**
