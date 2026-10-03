# Technical Design Specification: Wyckoff Structural Screener & Accumulation Phase Detector (Sahamology Phase 10)

- **Date**: 2026-10-03
- **Author**: Codex / Hermes Agent
- **Target Release**: Sahamology v0.14.0 (Phase 10)
- **Status**: Draft Specification for Adversarial Review & Implementation Planning

---

## 1. Executive Summary & Problem Statement

Sahamology's existing quantitative stack provides robust EOD bandarmology metrics:
- Adi Sucipto target math and gate evaluations ($G0$–$G4$) on `/desk`.
- Multi-window broker absorption scanning ($AQS$, rolling $1D/3D/5D/20D$ flow) and Foreign/Domestic Whale divergence tracking (Phase 8).
- Macro Dynamic Overlay ($RPI$, USD/IDR velocity, BI-Rate decision matrix) and phased tranche order execution (Phase 9).

However, traders and quantitative analysts on the Indonesia Stock Exchange (IDX) face a persistent timing challenge: **distinguishing early accumulation from active mark-up readiness**. 

1. **Premature Entry in Phase B Churn**: An emiten may show strong institutional absorption ($AQS \ge 75$) but remain locked in Wyckoff Phase B for months, absorbing supply while moving sideways. Entering too early ties up capital and exposes swing traders to prolonged opportunity cost.
2. **False Breakout vs. Spring Differentiation**: Traders frequently mistake an institutional terminal shakeout ("Spring") for an invalidation breakdown, selling right before the markup, or mistake a distribution "Upthrust" (UTAD) for a genuine breakout.
3. **Lack of Price-Volume Structural Context**: While bandarmology reveals *who* is transacting (broker net value and concentration), Richard Wyckoff's structural methodology reveals *where the stock is situated within its market campaign cycle*.

This specification formalizes **Phase 10: The Wyckoff Structural Screener & Accumulation Phase Detector**, synthesizing classical Wyckoff market schematic analysis with Adi Sucipto quantitative bandarmology.

---

## 2. Invariants & Fail-Closed Architectural Boundaries

1. **Zero-Stance Mutation Invariant**:
   - The Wyckoff Phase Detector and structural event flags are **informational confluence badges and discovery filters only**.
   - They must **never** mutate Playbook Decision Card gates ($G0$–$G4$) or alter live trading stances (`ENTER`/`WAIT`/`AVOID`).
   - Promotion of a Wyckoff signal into an active entry trigger is strictly prohibited until verified by an out-of-sample walk-forward test meeting the standard sample floor ($N \ge 30$).
2. **Zero Additional External API Strain**:
   - All Wyckoff structural calculations (support/resistance pivots, spread-volume anomalies, Spring tests) must be derived from stored daily price bars (`price_history`) and broker absorption records (`flow_absorption_daily`).
   - Zero additional network queries may be dispatched to Stockbit's rate-limited upstream API.
3. **Sparse History & Illiquid Fallback**:
   - Validating a Wyckoff Trading Range ($TR$) requires at least 40 continuous trading days of price and volume data.
   - If history is $< 40$ bars or average daily volume is $< \text{Rp } 500\text{M}$, the engine emits `WYCKOFF_UNCLASSIFIED` or `INSUFFICIENT_HISTORY` rather than manufacturing speculative phase calls.
4. **Fail-Closed Calendar Guard**:
   - The Wyckoff evaluation pipeline respects `isIdxTradingDay()`. On weekends and official IDX holidays, it logs a clean no-op.

---

## 3. Mathematical Formulation & Structural Taxonomy

```
Wyckoff Accumulation Schematic (Type 1 with Spring):

Price |
      |          Preliminary Support (PS)
      |              \
Resistance (Creek) - - \ - - - - - Automatic Rally (AR) - - - - - - - - - - - - - Sign of Strength (SOS)
      |                 \         /             \                   /       /      /
      |                  \       /               \   Phase B       /       /      /   Phase E (Markup)
      |                   \     /                 \  Absorption   /  LPS  /      /
Support (Ice) - - - - - - - \ -/- - - - - - - - - - \ - - - - - -/- - - - - - - /
      |                      v                       v          /
      |               Selling Climax (SC)       Secondary Test (ST)
      |                                                \
      |                                              Spring (Phase C)
      +------------------------------------------------------------------------------------------------ Date
              Phase A (Stopping)      Phase B (Building Cause)    Phase C/D (Testing & Transition)
```

### 3.1 Trading Range ($TR$) Detection & Pivot Clustering
A Trading Range is bounded by horizontal price references:
- **Resistance ($CREEK$)**: The upper boundary established by the Automatic Rally ($AR$) or high of the trading range.
- **Support ($ICE$)**: The lower boundary established by the Selling Climax ($SC$) or low of the trading range.

$$\text{Range Width \%} = \frac{CREEK - ICE}{ICE} \times 100$$

A valid Trading Range must satisfy:
$$8\% \le \text{Range Width \%} \le 35\% \quad \text{across } N \ge 25 \text{ bars}$$

### 3.2 Volume Spread Analysis (VSA) Metrics
For each bar $t$:
- **Spread ($S_t$)**: $S_t = \text{High}_t - \text{Low}_t$
- **Relative Spread ($RS_t$)**: $RS_t = \frac{S_t}{\text{SMA}(S, 20)}$
- **Relative Volume ($RV_t$)**: $RV_t = \frac{\text{Volume}_t}{\text{SMA}(\text{Volume}, 20)}$
- **Close Position in Bar ($CP_t$)**: 
  $$CP_t = \frac{\text{Close}_t - \text{Low}_t}{\text{High}_t - \text{Low}_t} \in [0.0, 1.0]$$

### 3.3 Core Structural Events

```
+--------------------+---------------------------------------+---------------------------------------+
| Wyckoff Event      | Price Spread & Location Metric        | Volume & Brosum Confluence Metric     |
+--------------------+---------------------------------------+---------------------------------------+
| Selling Climax     | Lowest low in $\ge 20$ bars,          | Ultra-high volume ($RV_t \ge 2.5$),   |
| (SC)               | Wide spread down ($RS_t \ge 1.8$),    | High retail sell volume absorbed by   |
|                    | $CP_t \ge 0.35$ (hammer/off low)      | Top 3 institutional brokers           |
+--------------------+---------------------------------------+---------------------------------------+
| Automatic Rally    | High of sharp reflex bounce within    | Decreasing volume on approach to peak |
| (AR)               | 1–5 bars after SC                     | Establishes initial $CREEK$           |
+--------------------+---------------------------------------+---------------------------------------+
| Secondary Test     | Retest of SC level holding at or      | Volume contracts sharply:             |
| (ST)               | slightly above $ICE$ ($+2\%$)         | $RV_t \le 0.75 \times RV_{SC}$        |
+--------------------+---------------------------------------+---------------------------------------+
| Spring             | Intraday breach below $ICE$ (up to    | Low Volume Spring: $RV_t < 1.0$       |
| (Phase C)          | $-3\%$), closing strictly back inside | (lack of supply). High Volume Spring: |
|                    | $TR$ ($Close_t > ICE$)                | $RV_t > 1.5$ with $AQS \ge 75$ (shake)|
+--------------------+---------------------------------------+---------------------------------------+
| Sign of Strength   | Wide spread up ($RS_t \ge 1.5$),      | Expanding volume ($RV_t \ge 1.8$),    |
| (SOS)              | $CP_t \ge 0.75$, crossing above range | Institutional accumulation score      |
|                    | midpoint or testing $CREEK$           | $AQS \ge 65$                          |
+--------------------+---------------------------------------+---------------------------------------+
| Last Point Support | Shallow pullback holding above range  | Low volume ($RV_t < 0.8$),            |
| (LPS)              | midpoint, forming higher low          | Spread narrows ($RS_t < 0.8$)         |
+--------------------+---------------------------------------+---------------------------------------+
| Upthrust / UTAD    | Penetration above $CREEK$ that fails  | High volume rejection ($CP_t < 0.35$) |
| (Distribution)     | and closes back below $CREEK$         | or low volume lack of demand          |
+--------------------+---------------------------------------+---------------------------------------+
```

### 3.4 Phase Classification Algorithm

The classifier evaluates a sliding window of historical bars ($40$ to $120$ trading days) to determine the current operational phase:

1. **`PHASE_A_STOPPING`**:
   - Identified if $SC$ and $AR$ have printed within the last 15 bars.
   - Volatility is elevated; primary downtrend halted, range boundaries establishing.
2. **`PHASE_B_ABSORPTION`**:
   - Price oscillating between $ICE$ and $CREEK$ without decisive breakout.
   - Testing secondary resistance and support.
   - **Brosum Confluence**: $AQS \ge 60$ designates *Accumulation Phase B* (whales absorbing). $AQS < 40$ designates *Redistribution Phase B*.
3. **`PHASE_C_TESTING` (The Spring Zone)**:
   - Valid Spring detected within the last 5 bars.
   - Risk/reward is maximally asymmetric because invalidation stop is defined right below the Spring low.
4. **`PHASE_D_TRANSITION`**:
   - Successful $SOS$ breakout attempt followed by $LPS$ consolidation above range midpoint.
   - Supply exhausted; volume expands on rallies and dries up on pullbacks.
5. **`PHASE_E_MARKUP`**:
   - Clean, confirmed daily close above $CREEK$ ($> 1.02 \times CREEK$).
   - Sustained trend outside the trading range.
6. **`PHASE_DISTRIBUTION`**:
   - $UTAD$ detected, or price breaking below $ICE$ with high volume and institutional distribution tags ($AQS < 30$).

---

## 4. Relational Database Schema (`supabase/030_wyckoff_structure.sql`)

```sql
-- Migration 030: Wyckoff Structural Screener & Accumulation Phase Registry

CREATE TABLE IF NOT EXISTS wyckoff_trading_ranges (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  ice_support_price NUMERIC(12, 2) NOT NULL,
  creek_resistance_price NUMERIC(12, 2) NOT NULL,
  range_width_pct NUMERIC(6, 2) NOT NULL,
  range_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' 
    CHECK (range_status IN ('ACTIVE', 'BROKEN_OUT_UP', 'BROKEN_OUT_DOWN', 'INVALIDATED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wyckoff_range UNIQUE (emiten, start_date)
);

CREATE TABLE IF NOT EXISTS wyckoff_structural_events (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  event_type VARCHAR(30) NOT NULL 
    CHECK (event_type IN ('SELLING_CLIMAX', 'AUTOMATIC_RALLY', 'SECONDARY_TEST', 'SPRING', 'SIGN_OF_STRENGTH', 'LAST_POINT_OF_SUPPORT', 'UPTHRUST', 'UTAD')),
  price NUMERIC(12, 2) NOT NULL,
  relative_volume NUMERIC(6, 2) NOT NULL,
  relative_spread NUMERIC(6, 2) NOT NULL,
  close_position NUMERIC(4, 2) NOT NULL,
  aqs_score INT,
  event_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wyckoff_event UNIQUE (emiten, trade_date, event_type)
);

CREATE TABLE IF NOT EXISTS wyckoff_daily_assessments (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  current_phase VARCHAR(30) NOT NULL 
    CHECK (current_phase IN ('PHASE_A_STOPPING', 'PHASE_B_ABSORPTION', 'PHASE_C_SPRING', 'PHASE_D_TRANSITION', 'PHASE_E_MARKUP', 'PHASE_DISTRIBUTION', 'WYCKOFF_UNCLASSIFIED')),
  confidence_score INT NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  ice_level NUMERIC(12, 2),
  creek_level NUMERIC(12, 2),
  last_event VARCHAR(30),
  spring_low NUMERIC(12, 2),
  markup_readiness_score INT CHECK (markup_readiness_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wyckoff_daily UNIQUE (emiten, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_wyckoff_daily_phase ON wyckoff_daily_assessments(trade_date, current_phase);
CREATE INDEX IF NOT EXISTS idx_wyckoff_events_emiten ON wyckoff_structural_events(emiten, trade_date);
```

---

## 5. Domain Engine Architecture (`lib/wyckoff/`)

```
lib/wyckoff/
├── types.ts          # Core domain interfaces, WyckoffPhase, WyckoffEvent, TradingRange
├── range-finder.ts   # Horizontal support/resistance clustering & Creek/Ice identification
├── vsa.ts            # Volume Spread Analysis math (spread, relative volume, close position)
├── event-detector.ts # Heuristics for SC, AR, ST, Spring, SOS, LPS, UTAD
├── classifier.ts     # Master Wyckoff phase classification with Brosum AQS confluence
└── index.ts          # Public domain API exports
```

### 5.1 Public Interfaces

```ts
export type WyckoffPhase =
  | 'PHASE_A_STOPPING'
  | 'PHASE_B_ABSORPTION'
  | 'PHASE_C_SPRING'
  | 'PHASE_D_TRANSITION'
  | 'PHASE_E_MARKUP'
  | 'PHASE_DISTRIBUTION'
  | 'WYCKOFF_UNCLASSIFIED';

export type WyckoffEventType =
  | 'SELLING_CLIMAX'
  | 'AUTOMATIC_RALLY'
  | 'SECONDARY_TEST'
  | 'SPRING'
  | 'SIGN_OF_STRENGTH'
  | 'LAST_POINT_OF_SUPPORT'
  | 'UPTHRUST'
  | 'UTAD';

export interface WyckoffBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WyckoffAssessment {
  emiten: string;
  asOfDate: string;
  phase: WyckoffPhase;
  confidenceScore: number;         // 0 - 100
  markupReadinessScore: number;    // 0 - 100
  iceSupport: number | null;
  creekResistance: number | null;
  activeEvents: Array<{
    type: WyckoffEventType;
    date: string;
    price: number;
    notes: string;
  }>;
  springDetected: boolean;
  springLow?: number;
  confluenceTags: string[];
}
```

---

## 6. UI Surfaces & Integration Points

1. **`/radar` (Brosum Insider Radar)**:
   - Add a dedicated **Wyckoff Phase Filter** in the header (`All Phases`, `Phase C (Spring)`, `Phase D (SOS)`, `Phase B (Absorption)`).
   - Display a Wyckoff Phase pill tag in the radar table rows alongside the existing $AQS$ badge.
   - In the Radar Inspection Drawer, render a schematic visualization card showing the trading range, $ICE$/$CREEK$ price lines, and detected structural milestones.
2. **`/desk` (08:30 WIB Battle Plan & Ranked Desk)**:
   - Enrich `BattlePlanCard` with a structural context tag (e.g. `🎯 Phase C Spring Reversal` or `🚀 Phase D Breakout Expansion`).
   - If a setup is in `PHASE_C_SPRING`, display the Spring Low as a high-precision invalidation anchor.
3. **`Calculator.tsx`**:
   - Display a compact Wyckoff Structure badge in `InsiderRadarCard.tsx`.

---

## 7. Verification Strategy & Gating Criteria

1. **Mathematical Unit Tests**:
   - `lib/wyckoff/vsa.test.ts`: Spread and volume ratios across known test vectors.
   - `lib/wyckoff/range-finder.test.ts`: Creek/Ice clustering across noisy sideways datasets.
   - `lib/wyckoff/event-detector.test.ts`: Pinned tests verifying Springs, Selling Climaxes, and Upthrusts against synthetic price/volume series.
   - `lib/wyckoff/classifier.test.ts`: Deterministic evaluation of Phase A through E transitions.
2. **Integration Tests**:
   - `lib/wyckoff-db.test.ts`: Persistence and recovery from `supabase/030_wyckoff_structure.sql`.
   - `app/api/radar/wyckoff.test.ts`: Endpoint serialization and fail-closed holiday response handling.
3. **Served-Surface Visual QA**:
   - Headless browser verification on Port 3030 across 1280×800 and 375×667 viewports, verifying zero layout overflow and full WCAG AA contrast compliance.
4. **Walk-Forward Evaluation CLI**:
   - `scripts/run-wyckoff-walkforward.ts`: Sample floor gate ($N \ge 30$) enforcing `SHIP_GATE=VERDICT_UNREACHABLE` until live out-of-sample forward trades accumulate.
