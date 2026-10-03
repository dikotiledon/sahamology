# Phase 10: Wyckoff Structural Screener & Accumulation Phase Detector Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using strict TDD (write failing test first, run test to verify failure, implement minimal code, verify test passes, then commit). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship Phase 10 (Wyckoff Structural Screener & Accumulation Phase Detector) for Sahamology, providing automated price-volume trading range identification ($ICE$ support / $CREEK$ resistance), structural milestone detection (Selling Climax, Spring, SOS, LPS, UTAD), Wyckoff Phase classification (Phase A through E), and Brosum $AQS$ confluence multipliers.

**Architecture:** Pure mathematical engine under `lib/wyckoff/`, persisted in PostgreSQL via `supabase/030_wyckoff_structure.sql`. Integrated into `GET /api/radar/wyckoff` and UI surfaces on `/radar` and `/desk`, preserving zero-stance boundary invariants (G0–G4 remain unmutated).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), PostgreSQL 16 (native `pg`), Tailwind-free semantic CSS in `globals.css`, Node test runner (`tsx --test`).

**Spec:** `docs/superpowers/specs/2026-10-03-wyckoff-structural-screener-design.md`

---

## Global Constraints & Invariants
- **Zero-Stance Boundary**: Wyckoff phases and event badges are display and diagnostic filters only; they must **never** mutate Playbook Decision Card gates ($G0$–$G4$) or live trading stances (`ENTER`/`WAIT`/`AVOID`).
- **Zero External API Strain**: All structural and VSA calculations derive from existing daily price history and broker flow snapshots; zero additional queries to Stockbit's rate-limited API.
- **Fail-Closed Calendar & Sparse History**: The evaluator checks `isIdxTradingDay()`. Emitens with $< 40$ bars of price history emit `WYCKOFF_UNCLASSIFIED` or `INSUFFICIENT_HISTORY`.

---

### Task 1: Database Migration `030_wyckoff_structure.sql` & Schema Foundations

**Files:**
- Create: `supabase/030_wyckoff_structure.sql`
- Modify: `lib/db.ts`
- Create: `lib/wyckoff-db.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write migration SQL and DB persistence helpers**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: Core Domain Types & Volume Spread Analysis (VSA) Math

**Files:**
- Create: `lib/wyckoff/types.ts`
- Create: `lib/wyckoff/vsa.ts`
- Create: `lib/wyckoff/vsa.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement VSA calculations (spread, relative volume, close position)**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: Trading Range ($TR$) Clustering & Ice/Creek Boundaries

**Files:**
- Create: `lib/wyckoff/range-finder.ts`
- Create: `lib/wyckoff/range-finder.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement Trading Range pivot detector**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: Structural Event Detector (SC, AR, ST, Spring, SOS, LPS, UTAD)

**Files:**
- Create: `lib/wyckoff/event-detector.ts`
- Create: `lib/wyckoff/event-detector.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement event detection heuristics with Brosum AQS confluence**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: Master Wyckoff Phase Classifier & Index API

**Files:**
- Create: `lib/wyckoff/classifier.ts`
- Create: `lib/wyckoff/index.ts`
- Create: `lib/wyckoff/classifier.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement phase transitions (A through E) and readiness scoring**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: API Route Handler `GET /api/radar/wyckoff`

**Files:**
- Create: `app/api/radar/wyckoff/route.ts`
- Create: `app/api/radar/wyckoff/route.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement API handler with date/emiten filtering and fail-closed holiday response**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 7: UI Surface Integration on `/radar` & `/desk`

**Files:**
- Create: `app/components/WyckoffBadge.tsx`
- Create: `app/components/WyckoffSchematicCard.tsx`
- Modify: `app/radar/page.tsx`
- Modify: `app/components/BattlePlanCard.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Author UI components with semantic CSS design tokens**
- [ ] **Step 2: Integrate Wyckoff phase pills and inspection schematic into Radar table and Battle Plan**
- [ ] **Step 3: Verify with typecheck, lint, and build**
- [ ] **Step 4: Commit**

---

### Task 8: Walk-Forward Evaluation Scaffold & End-to-End Verification

**Files:**
- Create: `scripts/run-wyckoff-walkforward.ts`
- Modify: `package.json`

- [ ] **Step 1: Implement walk-forward sample evaluator with $N \ge 30$ sample floor**
- [ ] **Step 2: Add `npm run walkforward:wyckoff` script to `package.json`**
- [ ] **Step 3: Run full verification suite (`typecheck`, `lint`, `test`, `build`)**
- [ ] **Step 4: Commit and push**
