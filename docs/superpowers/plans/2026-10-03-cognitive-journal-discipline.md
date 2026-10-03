# Phase 12: Cognitive Post-Trade Journal & Execution Discipline Engine Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using strict TDD (write failing test first, run test to verify failure, implement minimal code, verify test passes, then commit). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship Phase 12 (Cognitive Post-Trade Journal & Execution Discipline Engine) for Sahamology, providing post-trade behavioral deviation auditing (FOMO Chasing, Revenge Trading, Premature Exit, Stop Moving, Oversizing), quantitative Discipline Score ($0$–$100$), and rolling Trader Tilt Lockout protection.

**Architecture:** Pure mathematical engine under `lib/cognitive/`, persisted in PostgreSQL via `supabase/032_cognitive_journal.sql`. Integrated into `GET/POST /api/desk/cognitive-review` and UI surfaces on `/desk`, preserving zero-stance boundary invariants (G0–G4 remain unmutated).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), PostgreSQL 16 (native `pg`), Tailwind-free semantic CSS in `globals.css`, Node test runner (`tsx --test`).

**Spec:** `docs/superpowers/specs/2026-10-03-cognitive-journal-discipline-design.md`

---

## Global Constraints & Invariants
- **Zero-Stance Boundary**: Cognitive metrics and tilt advisories are post-execution behavioral audits and reflections only; they must **never** mutate Playbook Decision Card gates ($G0$–$G4$) or live trading stances (`ENTER`/`WAIT`/`AVOID`).
- **Zero External API Strain**: Operates purely on locally stored execution audit records and battle plan parameters; zero additional queries to Stockbit's API.
- **Fail-Closed Tilt Lockout**: 2 severe deviations in 2 hours or 3 consecutive low-discipline trades locks out new trade consideration.

---

### Task 1: Database Migration `032_cognitive_journal.sql` & Schema Foundations

**Files:**
- Create: `supabase/032_cognitive_journal.sql`
- Modify: `lib/db.ts`
- Create: `lib/cognitive-db.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write migration SQL and DB persistence helpers**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: Core Domain Types & Deviation Detection Rules

**Files:**
- Create: `lib/cognitive/types.ts`
- Create: `lib/cognitive/auditor.ts`
- Create: `lib/cognitive/auditor.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement deviation math (FOMO, Stop Widening, Premature Exit, Oversizing) and scoring**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: Trader Tilt State & Psychological Capital Gauge

**Files:**
- Create: `lib/cognitive/tilt-detector.ts`
- Create: `lib/cognitive/index.ts`
- Create: `lib/cognitive/tilt-detector.test.ts`

- [ ] **Step 1: Write the failing test for tilt transitions and psychological capital**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement rolling tilt evaluator and cooldown recovery logic**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: API Route Handler `GET/POST /api/desk/cognitive-review`

**Files:**
- Create: `app/api/desk/cognitive-review/route.ts`
- Create: `app/api/desk/cognitive-review/route.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement GET and POST handlers with DB fallback**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: UI Visual Component `CognitiveJournalCard.tsx` & Semantic Design Tokens

**Files:**
- Create: `app/components/CognitiveJournalCard.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Author cognitive review component with discipline score gauge and tilt alerts**
- [ ] **Step 2: Add semantic CSS design tokens in `app/globals.css` with dark/light theme support**
- [ ] **Step 3: Verify component renders cleanly without undefined class tokens**
- [ ] **Step 4: Commit**

---

### Task 6: Surface Integration in `/desk` Decision Flow

**Files:**
- Modify: `app/desk/page.tsx`

- [ ] **Step 1: Mount CognitiveJournalCard in Desk surface for post-trade reviews**
- [ ] **Step 2: Add Tilt Lockout advisory banner when trader psychological capital is depleted**
- [ ] **Step 3: Verify with typecheck, lint, and build**
- [ ] **Step 4: Commit**

---

### Task 7: Walk-Forward Discipline Evaluator & End-to-End Verification

**Files:**
- Create: `scripts/run-cognitive-discipline-walkforward.ts`
- Create: `scripts/run-cognitive-discipline-walkforward.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Implement walk-forward sample evaluator with $N \ge 30$ sample floor**
- [ ] **Step 2: Add `npm run walkforward:cognitive` script to `package.json`**
- [ ] **Step 3: Run full verification suite (`typecheck`, `lint`, `test`, `build`)**
- [ ] **Step 4: Commit and push**
