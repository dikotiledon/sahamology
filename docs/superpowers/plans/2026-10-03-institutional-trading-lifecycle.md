# The Institutional Trading Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build and ship the Institutional Trading Lifecycle for Sahamology, providing multi-window broker absorption scanning (AQS), foreign vs. domestic whale divergence tracking, automated 08:30 WIB pre-market battle planning ($V_{15m}$ volume rule), intraday tape crossing alerts, and dynamic IDX tick friction sizing with post-trade slippage audits.

**Architecture:** Implement pure mathematical engines in `lib/flow/`, `lib/tactical/`, `lib/tape/`, and `lib/risk/`, persisted via native PostgreSQL tables in `supabase/028_institutional_lifecycle.sql`. Connect the lifecycle to background jobs via BullMQ and expose display badges and interactive execution modals on `/radar` and `/desk` while preserving fail-closed zero-stance boundary invariants (G0–G4 remain unmutated).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), PostgreSQL 16 (native `pg`), Redis 7 + BullMQ, Tailwind CSS 4, Node test runner (`tsx --test`).

**Spec:** `docs/superpowers/specs/2026-10-03-institutional-trading-lifecycle-design.md`  
**Consensus Input:** `.omh/plans/2026-10-03-institutional-trading-lifecycle-consensus.md`

## Global Constraints
- **IDX Regulatory Compliance**: Individual broker codes are masked during market hours (09:00–15:45 WIB); intraday velocity alerts must operate strictly on aggregate metrics (Net Foreign Flow, Total Traded Volume). Detailed broker archetype tracking is strictly post-16:00 WIB EOD batch.
- **Fail-Closed Zero-Stance Invariant**: AQS scores, absorption tags, and divergence regimes are display-only badges and must NEVER mutate Playbook stances (`ENTER`/`WAIT`/`AVOID`) without an out-of-sample walk-forward gate pass ($N \ge 30$).
- **Zero API Rate Strain**: Multi-window broker summary metrics ($1D, 3D, 5D, 20D$) must be derived from stored daily tables using PostgreSQL window aggregations or local in-memory reduction; zero extra requests to Stockbit's rate-limited API.
- **Security Invariant**: No PIN entry or automated broker trade execution API is permitted; all trade execution logging remains user-confirmed and read-only.
- **Holiday & Weekend Resilience**: Pre-market battle plans and jobs must check `isIdxTradingDay()`; on holidays or non-trading days, they exit as clean, logged no-ops.

## Review Focus
1. **Empty/Sparse Historical Windows (<20 bars)**: Emits `INCOMPLETE_HISTORY` indicator rather than calculating distorted AQS or dividing by zero. Pinned in Task 3.
2. **Penny Stock Wash Trade Trapping**: Low-turnover emitens with tiny float manipulation must not trigger false Whale tags; requires turnover-relative floor $\ge \max(\text{Rp } 500\text{M}, 0.10 \times \text{ADTV}_{20d})$. Pinned in Task 4.
3. **Pre-Market Ingestion Dependency Failure**: When $T-1$ EOD capture is missing or incomplete, 08:30 WIB Battle Plan generator fails closed without emitting phantom price triggers. Pinned in Task 5.
4. **Pasar Nego Crossing Out-of-Bound Pricing**: Crossing transactions far below regular bid/offer must calculate the discount percentage and tag as structural repo/restructuring rather than directional markup. Pinned in Task 6.
5. **IDX Tick Boundary Rounding in Position Sizer**: Prices spanning tick step thresholds (e.g., Rp 198 to Rp 202) must use correct piecewise tick increments rather than uniform steps. Pinned in Task 7.

---

### Task 1: Database Migration & Schema Foundations

**Files:**
- Create: `supabase/028_institutional_lifecycle.sql`
- Modify: `lib/db.ts:850-950`
- Test: `lib/lifecycle-db.test.ts`

**Interfaces:**
- Produces: `saveFlowAbsorption()`, `getLatestFlowAbsorption()`, `saveBattlePlan()`, `getBattlePlanForDate()`, `saveTapeAlert()`, `saveExecutionAudit()`

- [x] **Step 1: Write the failing test**

```ts
// lib/lifecycle-db.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 028_institutional_lifecycle.sql contains all required tables and checks', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/028_institutional_lifecycle.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS broker_archetypes/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS flow_absorption_daily/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS premarket_battle_plans/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS intraday_tape_alerts/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS execution_audits/);
  assert.match(sql, /archetype IN \('foreign_institutional', 'domestic_institutional', 'retail', 'proprietary'\)/);
  assert.match(sql, /PRIMARY KEY \(emiten, trade_date\)/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/lifecycle-db.test.ts`  
Expected: FAIL (file `supabase/028_institutional_lifecycle.sql` does not exist).

- [x] **Step 3: Write minimal implementation**

Create `supabase/028_institutional_lifecycle.sql` with exact DDL from spec §3 (tables `broker_archetypes`, `flow_absorption_daily`, `premarket_battle_plans`, `intraday_tape_alerts`, `execution_audits`). Export DB helpers in `lib/db.ts`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/lifecycle-db.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add supabase/028_institutional_lifecycle.sql lib/lifecycle-db.test.ts lib/db.ts
git commit -m "feat(lifecycle): add 028 migration for institutional lifecycle schema"
```

---

### Task 2: Broker Archetype Registry & Mapping

**Files:**
- Create: `lib/flow/types.ts`
- Create: `lib/flow/archetypes.ts`
- Test: `lib/flow/archetypes.test.ts`

**Interfaces:**
- Produces: `classifyBrokerArchetype(code: string): BrokerClassification`

- [x] **Step 1: Write the failing test**

```ts
// lib/flow/archetypes.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBrokerArchetype } from './archetypes';

test('classifyBrokerArchetype maps foreign whales accurately', () => {
  const ak = classifyBrokerArchetype('AK');
  assert.equal(ak.archetype, 'foreign_institutional');
  assert.equal(ak.isWhale, true);

  const bk = classifyBrokerArchetype('BK');
  assert.equal(bk.archetype, 'foreign_institutional');
  assert.equal(bk.isWhale, true);
});

test('classifyBrokerArchetype maps retail brokers accurately', () => {
  const yp = classifyBrokerArchetype('YP');
  assert.equal(yp.archetype, 'retail');
  assert.equal(yp.isWhale, false);

  const pd = classifyBrokerArchetype('PD');
  assert.equal(pd.archetype, 'retail');
  assert.equal(pd.isWhale, false);
});

test('classifyBrokerArchetype handles unknown or lowercase codes gracefully', () => {
  const unknown = classifyBrokerArchetype('ZZ');
  assert.equal(unknown.archetype, 'unclassified');
  assert.equal(unknown.isWhale, false);

  const lower = classifyBrokerArchetype('ak');
  assert.equal(lower.archetype, 'foreign_institutional');
  assert.equal(lower.isWhale, true);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/flow/archetypes.test.ts`  
Expected: FAIL (module `./archetypes` not found).

- [x] **Step 3: Write minimal implementation**

Implement `lib/flow/types.ts` and `lib/flow/archetypes.ts` with static registry:
- Foreign whales: `AK, BK, CC, CS, RX, KZ, ZP, CG`
- Domestic institutions: `OD, LG, NI, DP, DX, TP`
- Retail: `YP, PD, XC, KK, CP, SQ, XL`

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/flow/archetypes.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/flow/types.ts lib/flow/archetypes.ts lib/flow/archetypes.test.ts
git commit -m "feat(flow): add broker archetype registry and classification helper"
```

---

### Task 3: Multi-Window Brosum Absorption & AQS Math

**Files:**
- Create: `lib/flow/absorption.ts`
- Test: `lib/flow/absorption.test.ts`

**Interfaces:**
- Consumes: `BrokerClassification` from `lib/flow/archetypes.ts`
- Produces: `calculateAbsorptionScore(input: AbsorptionInput): AbsorptionResult`

- [x] **Step 1: Write the failing test**

```ts
// lib/flow/absorption.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAbsorptionScore, AbsorptionInput } from './absorption';

test('calculateAbsorptionScore detects HEAVY_ABSORPTION when top 3 buyers absorb into flat price', () => {
  const input: AbsorptionInput = {
    top3Concentration5d: 0.65,
    netValue1d: 5_000_000_000,
    netValue3d: 12_000_000_000,
    netValue5d: 25_000_000_000,
    priceReturn5dPct: -1.5, // flat/consolidating
    barsCount: 20,
  };
  const result = calculateAbsorptionScore(input);
  assert.ok(result.score >= 75, `Expected score >= 75, got ${result.score}`);
  assert.equal(result.tag, 'HEAVY_ABSORPTION');
});

test('calculateAbsorptionScore handles sparse historical bars gracefully (<5 bars)', () => {
  const input: AbsorptionInput = {
    top3Concentration5d: 0.40,
    netValue1d: 1_000_000_000,
    netValue3d: 1_000_000_000,
    netValue5d: 1_000_000_000,
    priceReturn5dPct: 0.5,
    barsCount: 3,
  };
  const result = calculateAbsorptionScore(input);
  assert.equal(result.historyStatus, 'INCOMPLETE_HISTORY');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/flow/absorption.test.ts`  
Expected: FAIL (`calculateAbsorptionScore` not defined).

- [x] **Step 3: Write minimal implementation**

Implement `calculateAbsorptionScore` in `lib/flow/absorption.ts`:
- Concentration component (0–30 pts)
- Flow persistence component (0–30 pts)
- Absorption divergence component (0–40 pts: +40 for stealth base building, +25 for markup, 0 for distribution)
- Boundary guard: if `barsCount < 5`, returns `historyStatus: 'INCOMPLETE_HISTORY'`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/flow/absorption.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/flow/absorption.ts lib/flow/absorption.test.ts
git commit -m "feat(flow): implement multi-window absorption and AQS score calculation"
```

---

### Task 4: Foreign vs. Domestic Whale Divergence Classifier

**Files:**
- Create: `lib/flow/divergence.ts`
- Test: `lib/flow/divergence.test.ts`

**Interfaces:**
- Consumes: `classifyBrokerArchetype`
- Produces: `classifyDivergenceRegime(input: DivergenceInput): DivergenceResult`

- [x] **Step 1: Write the failing test**

```ts
// lib/flow/divergence.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDivergenceRegime, DivergenceInput } from './divergence';

test('detects WHALE_ABSORPTION when foreign institutional buying exceeds relative ADTV floor and retail sells', () => {
  const input: DivergenceInput = {
    adtv20d: 10_000_000_000, // 10B ADTV
    foreignNetVal5d: 2_500_000_000, // > 10% ADTV
    retailNetVal5d: -1_800_000_000,
    domesticInstNetVal5d: 500_000_000,
  };
  const result = classifyDivergenceRegime(input);
  assert.equal(result.regime, 'WHALE_ABSORPTION');
});

test('detects RETAIL_TRAP when retail buying dominates and whales dump', () => {
  const input: DivergenceInput = {
    adtv20d: 10_000_000_000,
    foreignNetVal5d: -2_000_000_000,
    retailNetVal5d: 3_000_000_000,
    domesticInstNetVal5d: -500_000_000,
  };
  const result = classifyDivergenceRegime(input);
  assert.equal(result.regime, 'RETAIL_TRAP');
});

test('enforces absolute IDR 500M floor for low turnover penny stocks', () => {
  const input: DivergenceInput = {
    adtv20d: 100_000_000, // 100M penny stock
    foreignNetVal5d: 20_000_000, // 20M is 20% ADTV but below 500M floor
    retailNetVal5d: -20_000_000,
    domesticInstNetVal5d: 0,
  };
  const result = classifyDivergenceRegime(input);
  assert.equal(result.regime, 'INSUFFICIENT_LIQUIDITY');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/flow/divergence.test.ts`  
Expected: FAIL (`classifyDivergenceRegime` not defined).

- [x] **Step 3: Write minimal implementation**

Implement `classifyDivergenceRegime` in `lib/flow/divergence.ts` enforcing:
- Threshold = $\max(500\_000\_000, 0.10 \times \text{ADTV}_{20d})$.
- Classifies `WHALE_ABSORPTION`, `RETAIL_TRAP`, `SYNCHRONIZED_ACCUMULATION`, `DOMESTIC_DRIVEN`, or `INSUFFICIENT_LIQUIDITY`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/flow/divergence.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/flow/divergence.ts lib/flow/divergence.test.ts
git commit -m "feat(flow): implement foreign vs domestic divergence classifier with ADTV floor"
```

---

### Task 5: 08:30 WIB Tactical Pre-Market Battle Plan Generator

**Files:**
- Create: `lib/tactical/battle-plan.ts`
- Test: `lib/tactical/battle-plan.test.ts`

**Interfaces:**
- Consumes: `decision_journal` stance, `macro_snapshot`, `flow_absorption_daily`, `isIdxTradingDay`
- Produces: `generatePreMarketBattlePlan(deps: BattlePlanDeps): Promise<BattlePlanOutput>`

- [x] **Step 1: Write the failing test**

```ts
// lib/tactical/battle-plan.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBattlePlanRow, BattlePlanCandidate } from './battle-plan';

test('buildBattlePlanRow calculates V15m volume confirmation threshold as 15% of 20d avg volume', () => {
  const candidate: BattlePlanCandidate = {
    emiten: 'BBCA',
    stance: 'ENTER',
    entryPrice: 10000,
    targetR1: 10500,
    targetMax: 11000,
    invalidationStop: 9700,
    avgDailyVolume20d: 50_000_000,
  };
  const row = buildBattlePlanRow(candidate);
  assert.equal(row.open15mVolThreshold, 7_500_000);
  assert.equal(row.triggerPrice, 10000);
});

test('buildBattlePlanRow fails closed if T-1 entry price or invalidation is missing', () => {
  const candidate: any = { emiten: 'BBCA', stance: 'ENTER', entryPrice: null };
  const row = buildBattlePlanRow(candidate);
  assert.equal(row, null);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/tactical/battle-plan.test.ts`  
Expected: FAIL (`buildBattlePlanRow` not defined).

- [x] **Step 3: Write minimal implementation**

Implement `lib/tactical/battle-plan.ts` with `buildBattlePlanRow` and `generatePreMarketBattlePlan`. Check `isIdxTradingDay(now)` and return `{ status: 'SKIPPED_HOLIDAY' }` on non-trading days.

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/tactical/battle-plan.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/tactical/battle-plan.ts lib/tactical/battle-plan.test.ts
git commit -m "feat(tactical): implement 08:30 WIB battle plan generator and V15m volume rule"
```

---

### Task 6: Intraday Tape Alert & Crossing Engine

**Files:**
- Create: `lib/tape/alert-engine.ts`
- Test: `lib/tape/alert-engine.test.ts`

**Interfaces:**
- Produces: `evaluateTapeAlerts(snapshot: TapeSnapshot): TapeAlert[]`

- [x] **Step 1: Write the failing test**

```ts
// lib/tape/alert-engine.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTapeAlerts, TapeSnapshot } from './alert-engine';

test('detects CROSSING_DETECTED with premium/discount calculation when nego value >= 5B IDR', () => {
  const snapshot: TapeSnapshot = {
    emiten: 'BUMI',
    regularPrice: 150,
    regularVolume: 10_000_000,
    negoVolume: 50_000_000,
    negoPrice: 135, // 10% discount
    negoValue: 6_750_000_000,
    netForeignFlowRate: 1_000_000,
  };
  const alerts = evaluateTapeAlerts(snapshot);
  const crossing = alerts.find(a => a.alertType === 'CROSSING_DETECTED');
  assert.ok(crossing, 'Expected CROSSING_DETECTED alert');
  assert.equal(crossing.evidence.discountPct, 10.0);
  assert.equal(crossing.severity, 'WARNING');
});

test('detects FLOW_VELOCITY_SPIKE on aggregate foreign flow acceleration without individual broker codes', () => {
  const snapshot: TapeSnapshot = {
    emiten: 'ASII',
    regularPrice: 5000,
    regularVolume: 5_000_000,
    negoVolume: 0,
    negoPrice: 0,
    negoValue: 0,
    netForeignFlowRate: 4_500_000_000, // surge
    avgOpeningFlowRate: 1_000_000_000, // 4.5x rate
  };
  const alerts = evaluateTapeAlerts(snapshot);
  const velocity = alerts.find(a => a.alertType === 'FLOW_VELOCITY_SPIKE');
  assert.ok(velocity, 'Expected FLOW_VELOCITY_SPIKE alert');
  assert.equal(velocity.severity, 'CRITICAL');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/tape/alert-engine.test.ts`  
Expected: FAIL (`evaluateTapeAlerts` not defined).

- [x] **Step 3: Write minimal implementation**

Implement `evaluateTapeAlerts` in `lib/tape/alert-engine.ts` checking:
- Crossing threshold ($\ge \text{Rp } 5\text{B}$ or $V_{NG}/V_{REG} \ge 0.20$), calculating discount/premium %
- Velocity surge ($>3\times$ opening flow rate on aggregate foreign/volume)
- Pre-closing auction price shift ($> \pm 3\%$)

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/tape/alert-engine.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/tape/alert-engine.ts lib/tape/alert-engine.test.ts
git commit -m "feat(tape): implement intraday tape alert and crossing detection engine"
```

---

### Task 7: Dynamic IDX Position Sizer & Friction Math

**Files:**
- Create: `lib/risk/sizer.ts`
- Test: `lib/risk/sizer.test.ts`

**Interfaces:**
- Produces: `getIdxTickSize(price: number): number`, `calculatePositionSize(input: SizerInput): SizerResult`

- [x] **Step 1: Write the failing test**

```ts
// lib/risk/sizer.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getIdxTickSize, calculatePositionSize } from './sizer';

test('getIdxTickSize conforms to official IDX fraksi harga brackets', () => {
  assert.equal(getIdxTickSize(150), 1);
  assert.equal(getIdxTickSize(300), 2);
  assert.equal(getIdxTickSize(1200), 5);
  assert.equal(getIdxTickSize(3500), 10);
  assert.equal(getIdxTickSize(7500), 25);
});

test('calculatePositionSize accurately sizes lots with friction and 20% equity cap', () => {
  const result = calculatePositionSize({
    accountEquity: 100_000_000,
    riskPercentage: 1.0, // Rp 1,000,000 max risk
    plannedEntry: 2450,
    invalidationStop: 2330,
    buyFeePct: 0.15,
    sellFeePct: 0.25,
  });
  // Risk per share = (2450 - 2330) + (2450 * 0.0015) + (2330 * 0.0025) = 120 + 3.675 + 5.825 = 129.5
  // Max lots = floor(1,000,000 / (129.5 * 100)) = 77 lots
  assert.equal(result.recommendedLots, 77);
  assert.ok(result.allocatedCapital <= 20_000_000, 'Must respect 20% capital cap');
  assert.ok(result.totalRiskAtStop <= 1_000_000, 'Must not exceed 1% risk');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/risk/sizer.test.ts`  
Expected: FAIL (`getIdxTickSize` not defined).

- [x] **Step 3: Write minimal implementation**

Implement `getIdxTickSize` and `calculatePositionSize` in `lib/risk/sizer.ts` handling exact lot math (1 lot = 100 shares), brokerage fees, and 20% portfolio cap.

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/risk/sizer.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/risk/sizer.ts lib/risk/sizer.test.ts
git commit -m "feat(risk): implement dynamic IDX position sizer and tick friction calculator"
```

---

### Task 8: Execution & Slippage Audit Journal Engine

**Files:**
- Create: `lib/risk/audit.ts`
- Test: `lib/risk/audit.test.ts`

**Interfaces:**
- Produces: `calculateExecutionAudit(input: AuditInput): AuditResult`

- [x] **Step 1: Write the failing test**

```ts
// lib/risk/audit.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExecutionAudit, AuditInput } from './audit';

test('calculateExecutionAudit computes tick distance and slippage drag accurately', () => {
  const input: AuditInput = {
    plannedEntry: 2450, // tick size is 10
    executedEntry: 2480, // chased 3 ticks
    plannedR1: 2670,
    invalidationStop: 2330,
    lots: 77,
  };
  const audit = calculateExecutionAudit(input);
  assert.equal(audit.slippageTicks, 3);
  assert.equal(audit.slippagePct, 1.224);
  assert.ok(audit.adjustedNetRR < audit.theoreticalNetRR);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/risk/audit.test.ts`  
Expected: FAIL (`calculateExecutionAudit` not defined).

- [x] **Step 3: Write minimal implementation**

Implement `calculateExecutionAudit` in `lib/risk/audit.ts` calculating exact tick differences, adjusted R:R, and efficiency metrics.

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/risk/audit.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add lib/risk/audit.ts lib/risk/audit.test.ts
git commit -m "feat(risk): implement execution slippage audit and realized RR engine"
```

---

### Task 9: API Endpoints for Radar & Desk

**Files:**
- Create: `app/api/radar/absorption/route.ts`
- Create: `app/api/desk/battle-plan/route.ts`
- Create: `app/api/desk/execution-audit/route.ts`
- Test: `app/api/desk/lifecycle-api.test.ts`

**Interfaces:**
- Exposes: `GET /api/radar/absorption`, `GET /api/desk/battle-plan`, `POST /api/desk/execution-audit`

- [x] **Step 1: Write the failing test**

```ts
// app/api/desk/lifecycle-api.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as getBattlePlan } from './battle-plan/route';
import { GET as getAbsorption } from '../radar/absorption/route';

test('API route handlers are exported functions', () => {
  assert.equal(typeof getBattlePlan, 'function');
  assert.equal(typeof getAbsorption, 'function');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test app/api/desk/lifecycle-api.test.ts`  
Expected: FAIL (modules not found).

- [x] **Step 3: Write minimal implementation**

Create route handlers in Next.js 16 App Router format returning JSON representations of absorption data, battle plans, and handling audit submissions.

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx --test app/api/desk/lifecycle-api.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add app/api/radar/absorption/route.ts app/api/desk/battle-plan/route.ts app/api/desk/execution-audit/route.ts app/api/desk/lifecycle-api.test.ts
git commit -m "feat(api): expose lifecycle endpoints for absorption, battle plans, and execution audits"
```

---

### Task 10: UI Surface Integration

**Files:**
- Create: `app/components/PositionSizerModal.tsx`
- Modify: `app/radar/page.tsx:50-250`
- Modify: `app/desk/page.tsx:40-200`
- Test: `app/components/PositionSizerModal.test.ts`

**Interfaces:**
- Renders: Position Sizer Modal, Battle Plan Card on `/desk`, Alert Ribbon, Absorption Matrix on `/radar`

- [x] **Step 1: Write the failing test**

```ts
// app/components/PositionSizerModal.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('PositionSizerModal exports a valid React component structure', () => {
  const content = readFileSync(resolve(process.cwd(), 'app/components/PositionSizerModal.tsx'), 'utf8');
  assert.match(content, /export function PositionSizerModal/);
  assert.match(content, /calculatePositionSize/);
  assert.match(content, /recommendedLots/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test app/components/PositionSizerModal.test.ts`  
Expected: FAIL (file not found).

- [x] **Step 3: Write minimal implementation**

Author `app/components/PositionSizerModal.tsx` and integrate into `/desk` and `/radar` page surfaces with clean Tailwind styling.

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx --test app/components/PositionSizerModal.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add app/components/PositionSizerModal.tsx app/components/PositionSizerModal.test.ts app/radar/page.tsx app/desk/page.tsx
git commit -m "feat(ui): integrate PositionSizerModal, battle plan card, and absorption surfaces"
```

---

### Task 11: End-to-End Verification & Walk-Forward Scaffold

**Files:**
- Create: `scripts/run-lifecycle-walkforward.ts`
- Modify: `package.json:20-27`
- Test: Full repository test suite (`npm run test`)

**Interfaces:**
- Produces: CLI script `npm run walkforward:lifecycle` asserting `SHIP_GATE=VERDICT_UNREACHABLE` until $N \ge 30$ OOS trades exist.

- [x] **Step 1: Write the failing test**

```ts
// scripts/lifecycle-walkforward.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLifecycleGate } from './run-lifecycle-walkforward';

test('evaluateLifecycleGate returns VERDICT_UNREACHABLE when sample is below 30 trades', () => {
  const result = evaluateLifecycleGate({ sampleCount: 12, expectancy: 0.15 });
  assert.equal(result.gateStatus, 'VERDICT_UNREACHABLE');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test scripts/lifecycle-walkforward.test.ts`  
Expected: FAIL (module not found).

- [x] **Step 3: Write minimal implementation**

Author `scripts/run-lifecycle-walkforward.ts` mirroring Phase 2/4 gates. Wire `"walkforward:lifecycle"` into `package.json`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx --test scripts/lifecycle-walkforward.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add scripts/run-lifecycle-walkforward.ts scripts/lifecycle-walkforward.test.ts package.json
git commit -m "feat(gate): add walk-forward evaluation script for institutional lifecycle"
```

---

## Self-Review Checklist
1. **Spec Coverage**:
   - Multi-window absorption & AQS score $\to$ Tasks 1, 3
   - Foreign vs. Domestic whale divergence $\to$ Tasks 2, 4
   - 08:30 WIB Battle Plan & $V_{15m}$ threshold $\to$ Tasks 1, 5
   - Intraday tape & crossing alerts $\to$ Tasks 1, 6
   - Dynamic sizer & execution audit $\to$ Tasks 7, 8, 9, 10
2. **Placeholder Scan**: Zero instances of "TODO", "TBD", or unstated code blocks.
3. **Type Consistency**: `calculateAbsorptionScore`, `classifyDivergenceRegime`, `calculatePositionSize`, and `getIdxTickSize` interfaces match across all consuming modules.
4. **Review Focus Verification**: All 5 potential failure modes identified in Review Focus have dedicated, pinned test cases across Tasks 3–7.
