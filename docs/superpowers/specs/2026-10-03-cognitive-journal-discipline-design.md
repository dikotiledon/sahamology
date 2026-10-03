# Phase 12 Specification: Cognitive Post-Trade Journal & Execution Discipline Engine

## 1. Executive Summary & Problem Statement

In systematic Indonesian equity trading, having a quantitative edge (Bandarmology G0–G4, Macro Dynamic Overlay, Wyckoff VSA, Volume Profile) is insufficient if the human operator suffers from cognitive and psychological execution leaks. The most common reasons systematic traders underperform backtests are execution deviations driven by emotional bias:
1. **FOMO Chasing**: Buying at prices significantly above the pre-market planned entry trigger because price started moving fast.
2. **Revenge Trading**: Re-entering the market immediately (< 30 minutes) after taking a stop loss on another emiten, seeking to "win back" losses.
3. **Premature Exit (Paper Hands)**: Liquidating a winning position at a tiny gain (+1–2 ticks) before reaching Target R1, despite trend (EMA20) and broker flow remaining bullish.
4. **Moving Stop Loss (Loss Aversion)**: Widening or cancelling an invalidation stop loss when price approaches it, turning a controlled $1R$ risk into catastrophic multi-$R$ drawdowns.
5. **Position Over-Sizing (Greed / Overconfidence)**: Exceeding the 20% portfolio equity cap or ignoring 30/40/30 tranche schedules.

Phase 12 introduces the **Cognitive Post-Trade Journal & Execution Discipline Engine** to Sahamology. It quantitatively benchmarks executed trade parameters against pre-market battle plans, detects behavioral deviations, assigns an objective **Discipline Score (0–100)**, and monitors a rolling **Trader Tilt Status** with automatic caution/lockout advisories.

---

## 2. Invariants & Non-Goals

1. **Zero-Stance Boundary**:
   - The Cognitive Journal is strictly an **execution reflection, psychological audit, and post-trade feedback loop**.
   - Cognitive metrics **never** mutate Playbook Decision Card gates ($G0$–$G4$) and **never** open live positions.
   - Entry triggers remain strictly governed by Adi Sucipto's quantitative formula on `/desk`.
2. **Deterministic Mathematical Scoring**:
   - Emotional deviations are detected through mathematical delta comparisons between planned parameters and actual execution prints (e.g. entry delta, stop delta, hold duration vs target distance).
3. **Fail-Closed Tilt Protection**:
   - If a trader accumulates 2 or more major emotional violations within a 2-hour window or 3 consecutive deviations, `TraderTiltState` escalates to `TILT_LOCKOUT`, rendering a prominent visual lockout warning advising immediate terminal shutdown.
4. **Zero External API Strain**:
   - Operates on locally stored execution audit records and battle plans; zero calls to external market APIs.
5. **Walk-Forward Verification Floor**:
   - Enforces the repository standard $N \ge 30$ sample floor for validating whether disciplined execution statistically beats unmonitored baseline execution.

---

## 3. Mathematical & Deviation Formulations

### 3.1. Behavioral Deviation Rules

Given:
- Planned Entry: $P_{\text{entry}}$, Realized Entry: $P_{\text{realized\_entry}}$
- Planned Stop: $P_{\text{stop}}$, Realized Exit: $P_{\text{realized\_exit}}$
- Target R1: $P_{\text{r1}}$, Target Max: $P_{\text{max}}$
- Fraksi Tick Size: $\Delta_{\text{tick}} = \text{getIdxTickSize}(P_{\text{entry}})$
- Tranche Planned Lots: $L_{\text{planned}}$, Realized Lots: $L_{\text{realized}}$

#### 1. FOMO Chasing (`FOMO_CHASE`)
Triggered when the trader executes an entry more than 2 ticks above the planned entry price:
$$\text{EntryTicks} = \frac{P_{\text{realized\_entry}} - P_{\text{entry}}}{\Delta_{\text{tick}}} > 2.0$$
*Penalty: $-25$ points.*

#### 2. Loss Aversion / Stop Widened (`STOP_WIDENED`)
Triggered when the realized exit price on a losing trade was lower than the planned invalidation stop by $> 1$ tick:
$$P_{\text{realized\_exit}} < P_{\text{stop}} - \Delta_{\text{tick}}$$
*Penalty: $-35$ points (Severe violation).*

#### 3. Premature Exit / Paper Hands (`PREMATURE_EXIT`)
Triggered when the trader exited with a positive gain, but realized exit price was less than $50\%$ of the planned distance to Target R1 while trend (EMA20) was still bullish:
$$P_{\text{entry}} < P_{\text{realized\_exit}} < P_{\text{entry}} + 0.5 \times (P_{\text{r1}} - P_{\text{entry}})$$
*Penalty: $-20$ points.*

#### 4. Sizing / Over-Leverage Violation (`OVERSIZING`)
Triggered when total realized lot size exceeds $1.15\times$ the calculated maximum risk lot size:
$$L_{\text{realized}} > 1.15 \times L_{\text{planned}}$$
*Penalty: $-25$ points.*

#### 5. Revenge Trading (`REVENGE_TRADE`)
Triggered when a trade entry timestamp is within 30 minutes of a stopped-out losing trade on a different emiten:
$$\Delta t_{\text{loss}} \le 30 \text{ minutes} \land \text{PreviousTrade.outcome} = \text{'STOP_OUT'}$$
*Penalty: $-30$ points.*

### 3.2. Quantitative Discipline Score ($0$–$100$)
$$\text{DisciplineScore} = \max\left(0, 100 - \sum \text{Penalties}\right)$$
- $\ge 85$: `MASTER_DISCIPLINE` (Green badge)
- $70$–$84$: `ACCEPTABLE_EXECUTION` (Cyan badge)
- $50$–$69$: `SLIPPY_DISCIPLINE` (Orange badge)
- $< 50$: `UNGOVERNED_EMOTIONAL_EXECUTION` (Red warning badge)

### 3.3. Trader Psychological Capital & Tilt Gauge
Psychological capital begins at $100\%$:
- Each clean trade ($\ge 85$ score) restores $+5\%$ capital (up to $100\%$).
- Each deviation subtracts points proportional to severity.
- If Psychological Capital falls $< 40\%$ OR 3 consecutive trades have Discipline Score $< 70$:
  $$\text{TiltState} = \text{'TILT_LOCKOUT'}$$

---

## 4. Architectural Interfaces & Data Contracts

```typescript
export type CognitiveDeviationType =
  | 'FOMO_CHASE'
  | 'STOP_WIDENED'
  | 'PREMATURE_EXIT'
  | 'OVERSIZING'
  | 'REVENGE_TRADE';

export interface CognitiveDeviation {
  type: CognitiveDeviationType;
  penalty: number;
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  description: string;
}

export interface TradeDisciplineReview {
  emiten: string;
  tradeDate: string;
  disciplineScore: number;
  grade: 'MASTER_DISCIPLINE' | 'ACCEPTABLE_EXECUTION' | 'SLIPPY_DISCIPLINE' | 'UNGOVERNED_EXECUTION';
  deviations: CognitiveDeviation[];
  notes?: string;
  psychologicalStateAtEntry?: 'CALM' | 'EUPHORIC' | 'ANXIOUS' | 'FRUSTRATED';
}

export interface TraderTiltStatus {
  psychologicalCapitalPct: number;
  consecutiveViolations: number;
  tiltState: 'NORMAL' | 'CAUTION' | 'TILT_LOCKOUT';
  advisory: string;
}
```

---

## 5. Database Schema Migration `032_cognitive_journal.sql`

```sql
CREATE TABLE IF NOT EXISTS cognitive_trade_reviews (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  planned_entry NUMERIC(12, 2) NOT NULL,
  realized_entry NUMERIC(12, 2) NOT NULL,
  planned_stop NUMERIC(12, 2) NOT NULL,
  realized_exit NUMERIC(12, 2),
  planned_lots INT NOT NULL,
  realized_lots INT NOT NULL,
  discipline_score INT NOT NULL CHECK (discipline_score BETWEEN 0 AND 100),
  grade VARCHAR(30) NOT NULL,
  deviations JSONB NOT NULL DEFAULT '[]'::jsonb,
  psychological_state VARCHAR(30) DEFAULT 'CALM',
  trader_reflection TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trader_psychological_capital (
  id INT PRIMARY KEY DEFAULT 1,
  capital_score INT NOT NULL DEFAULT 100 CHECK (capital_score BETWEEN 0 AND 100),
  consecutive_violations INT NOT NULL DEFAULT 0,
  tilt_state VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (tilt_state IN ('NORMAL', 'CAUTION', 'TILT_LOCKOUT')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cognitive_reviews_emiten ON cognitive_trade_reviews(emiten, trade_date);
```

---

## 6. Verification Deliverables

1. Migration `supabase/032_cognitive_journal.sql` & database queries in `lib/db.ts`.
2. Pure mathematical engine `lib/cognitive/auditor.ts` and `lib/cognitive/tilt-detector.ts`.
3. Route Handler `POST /api/desk/cognitive-review` and `GET /api/desk/cognitive-review`.
4. Visual Component `app/components/CognitiveJournalCard.tsx` with semantic design tokens in `app/globals.css`.
5. Walk-forward verification script `scripts/run-cognitive-discipline-walkforward.ts` ($N \ge 30$).
