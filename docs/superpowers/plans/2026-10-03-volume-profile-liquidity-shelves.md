# Phase 11: Volume Profile Shelves & Intraday Liquidity Distribution Engine (POC / VAH / VAL) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using strict TDD (write failing test first, run test to verify failure, implement minimal code, verify test passes, then commit). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship Phase 11 (Volume Profile Shelves & Liquidity Distribution Engine) for Sahamology, providing automated Volume-by-Price discretization aligned with IDX Fraksi Harga brackets, Point of Control (POC), Value Area High (VAH), Value Area Low (VAL, 70% volume distribution), High Volume Nodes (HVN shelves), Low Volume Voids (LVN slippage zones), and execution liquidity confluence.

**Architecture:** Pure mathematical engine under `lib/volume-profile/`, persisted in PostgreSQL via `supabase/031_volume_profile_shelves.sql`. Integrated into `GET /api/radar/volume-profile` and UI surfaces on `/radar` and `/desk`, preserving zero-stance boundary invariants (G0–G4 remain unmutated).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), PostgreSQL 16 (native `pg`), Tailwind-free semantic CSS in `globals.css`, Node test runner (`tsx --test`).

**Spec:** `docs/superpowers/specs/2026-10-03-volume-profile-liquidity-shelves-design.md`

---

## Global Constraints & Invariants
- **Zero-Stance Boundary**: Volume Profile metrics are display, execution risk, and confluence filters only; they must **never** mutate Playbook Decision Card gates ($G0$–$G4$) or live trading stances (`ENTER`/`WAIT`/`AVOID`).
- **Zero External API Strain**: All volume-by-price calculations derive from existing daily price history and broker flow snapshots; zero additional queries to Stockbit's rate-limited API.
- **IDX Fraksi Alignment**: Volume bins adapt dynamically to official IDX tick brackets (`1, 2, 5, 10, 25`).

---

### Task 1: Database Migration `031_volume_profile_shelves.sql` & Schema Foundations

**Files:**
- Create: `supabase/031_volume_profile_shelves.sql`
- Modify: `lib/db.ts`
- Create: `lib/volume-profile-db.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write migration SQL and DB persistence helpers**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: Core Domain Types & Fraksi-Aligned Volume Binning

**Files:**
- Create: `lib/volume-profile/types.ts`
- Create: `lib/volume-profile/calculator.ts`
- Create: `lib/volume-profile/calculator.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement discrete volume-by-price accumulation algorithm**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: 70% Value Area (VAH / VAL) & Point of Control (POC) Math

**Files:**
- Modify: `lib/volume-profile/calculator.ts`
- Modify: `lib/volume-profile/calculator.test.ts`

- [ ] **Step 1: Write the failing test for POC and 70% Value Area enclosure**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement Auction Market Theory iterative Value Area expansion**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: High Volume Nodes (HVN) & Low Volume Voids (LVN) Detection + Confluence

**Files:**
- Create: `lib/volume-profile/confluence.ts`
- Create: `lib/volume-profile/index.ts`
- Create: `lib/volume-profile/confluence.test.ts`

- [ ] **Step 1: Write the failing test for HVN/LVN clustering and trade confluence**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement local moving average peak/valley detector and status mapper**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: API Route Handler `GET /api/radar/volume-profile`

**Files:**
- Create: `app/api/radar/volume-profile/route.ts`
- Create: `app/api/radar/volume-profile/route.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement route handler with emiten, lookback window, and DB fallback**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: UI Visual Component `VolumeProfileCard.tsx` & Semantic Design Tokens

**Files:**
- Create: `app/components/VolumeProfileCard.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Author horizontal volume histogram component with POC, VAH, and VAL callouts**
- [ ] **Step 2: Add semantic CSS design tokens in `app/globals.css` with dark/light theme support**
- [ ] **Step 3: Verify component renders cleanly without undefined class tokens**
- [ ] **Step 4: Commit**

---

### Task 7: Surface Integration in `/radar` and `/desk`

**Files:**
- Modify: `app/radar/page.tsx`
- Modify: `app/components/BattlePlanCard.tsx`

- [ ] **Step 1: Integrate VolumeProfileCard into Radar emiten inspection drawer**
- [ ] **Step 2: Embed Volume Profile shelf badge and POC distance into 08:30 WIB Battle Plan**
- [ ] **Step 3: Verify with typecheck, lint, and build**
- [ ] **Step 4: Commit**

---

### Task 8: Walk-Forward Evaluation Scaffold & End-to-End Verification

**Files:**
- Create: `scripts/run-volume-profile-walkforward.ts`
- Create: `scripts/run-volume-profile-walkforward.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Implement walk-forward sample evaluator with $N \ge 30$ sample floor**
- [ ] **Step 2: Add `npm run walkforward:vp` script to `package.json`**
- [ ] **Step 3: Run full verification suite (`typecheck`, `lint`, `test`, `build`)**
- [ ] **Step 4: Commit and push**
