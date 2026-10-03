# Technical Design Specification: The Institutional Trading Lifecycle (Sahamology)

- **Date**: 2026-10-03
- **Author**: Codex / Hermes Agent
- **Target Release**: Sahamology v0.12.0
- **Status**: Approved for Implementation Planning

---

## 1. Executive Summary & Problem Statement

Sahamology has successfully established a deterministic core for Indonesian Stock Exchange (IDX) analysis, combining Adi Sucipto bandarmology target math, quantitative Playbook gates (G0–G4), the Ranked Desk (`/desk`), and Insider Radar (`/radar`). 

However, trading in the IDX institutional landscape presents three specific structural challenges:
1. **Single-day broker summary noise**: A single-day broker summary is easily manipulated via wash sales or localized churning. High-conviction bandarmology requires multi-day rolling accumulation and absorption detection (whales buying floating supply into price consolidation).
2. **Participant Blind Spots**: Aggregated broker net totals obscure whether buying power originates from foreign institutions (AK, BK, CC, CS, RX, KZ), domestic institutional funds, or retail crowd FOMO.
3. **Execution & Accountability Gaps**: Traders lack an integrated 08:30 WIB pre-market tactical battle plan with early volume confirmation rules, real-time crossing (Pasar Nego) alerts, dynamic IDX tick friction sizing, and post-trade slippage audits.

This specification formalizes **The Institutional Trading Lifecycle**: an end-to-end subsystem integrating 5 core professional functionalities:
1. **Multi-Window Brosum Absorption & Persistence Scanner** (Rolling T-1 to T-20 metrics & Accumulation Quality Score).
2. **Foreign vs. Domestic Institutional Divergence Tracker** (Archetype classification & Whale Absorption vs. Retail Trap regimes).
3. **Automated 08:30 WIB Pre-Market Tactical Battle Plan** (Pre-open briefing with $V_{15m}$ volume confirmation rule).
4. **Intraday Flow Velocity, Crossing & UMA Alert Engine** (Real-time velocity surges, Pasar Nego crossing blocks, and UMA proximity radar).
5. **Dynamic Position Sizer & Slippage Audit Journal** (IDX tick-accurate friction sizer, realized slippage tracking, and theoretical vs. realized expectancy feedback).

---

## 2. System Architecture & Topology

The Institutional Trading Lifecycle operates within the existing Next.js 16 standalone App Router, PostgreSQL 16 (`lib/db.ts`), and Redis 7 / BullMQ architecture.

```
                      ┌──────────────────────────────────────────────┐
                      │              Stockbit Data APIs              │
                      │   Running Trade  •  Brosum Daily  •  History │
                      └───────────────────────┬──────────────────────┘
                                              │
                         ┌────────────────────┴───────────────────┐
                         ▼                                        ▼
             (BullMQ Daily Ingestion)                 (Micro-Capture Ticks)
                         │                                        │
                         ▼                                        ▼
       ┌───────────────────────────────────┐    ┌───────────────────────────────────┐
       │   flow_absorption_daily Table     │    │   intraday_tape_alerts Table      │
       │   - 1D, 3D, 5D, 20D windows       │    │   - Velocity Spikes (>3x rate)    │
       │   - Top 3 concentration           │    │   - Crossing Blocks (Pasar Nego)  │
       │   - AQS Score (0-100) & tags      │    │   - Pre-Closing & UMA Alarms      │
       └─────────────────┬─────────────────┘    └─────────────────┬─────────────────┘
                         │                                        │
                         ▼                                        ▼
       ┌───────────────────────────────────┐    ┌───────────────────────────────────┐
       │   08:30 WIB Battle Plan Engine    │    │   Dynamic Sizer & Slippage Audit  │
       │   - Pre-market target sheet       │    │   - IDX tick & friction sizing    │
       │   - 15-minute volume threshold    │    │   - Realized execution logging    │
       │   - Macro regime context          │    │   - Expectancy feedback loop      │
       └─────────────────┬─────────────────┘    └─────────────────┬─────────────────┘
                         │                                        │
                         └───────────────────┬────────────────────┘
                                             ▼
                               ┌───────────────────────────┐
                               │   Surfaces: /desk & /radar│
                               └───────────────────────────┘
```

---

## 3. Data Model & Migrations (`supabase/028_institutional_lifecycle.sql`)

The migration introduces four new tables and adds foreign key constraints to `decision_journal`:

### 3.1 `broker_archetypes`
Curated registry of IDX broker participants:
```sql
CREATE TABLE IF NOT EXISTS broker_archetypes (
    broker_code VARCHAR(4) PRIMARY KEY,
    broker_name VARCHAR(100) NOT NULL,
    archetype VARCHAR(30) NOT NULL CHECK (archetype IN ('foreign_institutional', 'domestic_institutional', 'retail', 'proprietary')),
    is_whale BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Initial seed values include:
- `foreign_institutional` (Whales): `AK`, `BK`, `CC`, `CS`, `RX`, `KZ`, `ZP`, `CG`.
- `domestic_institutional`: `OD`, `LG`, `NI`, `DP`, `DX`, `TP`.
- `retail`: `YP`, `PD`, `XC`, `KK`, `CP`, `SQ`, `XL`.

### 3.2 `flow_absorption_daily`
Persisted rolling broker flow and absorption metrics per emiten per trading date:
```sql
CREATE TABLE IF NOT EXISTS flow_absorption_daily (
    emiten VARCHAR(10) NOT NULL,
    trade_date DATE NOT NULL,
    window_1d_net_val NUMERIC NOT NULL DEFAULT 0,
    window_3d_net_val NUMERIC NOT NULL DEFAULT 0,
    window_5d_net_val NUMERIC NOT NULL DEFAULT 0,
    window_20d_net_val NUMERIC NOT NULL DEFAULT 0,
    top3_concentration_1d NUMERIC(5,4) NOT NULL DEFAULT 0,
    top3_concentration_5d NUMERIC(5,4) NOT NULL DEFAULT 0,
    foreign_net_val_5d NUMERIC NOT NULL DEFAULT 0,
    domestic_whale_net_val_5d NUMERIC NOT NULL DEFAULT 0,
    retail_net_val_5d NUMERIC NOT NULL DEFAULT 0,
    price_change_5d_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
    absorption_quality_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    absorption_tag VARCHAR(25) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (emiten, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_flow_absorption_date_score 
ON flow_absorption_daily (trade_date, absorption_quality_score DESC);
```

### 3.3 `premarket_battle_plans`
Tactical pre-market setups generated at 08:30 WIB:
```sql
CREATE TABLE IF NOT EXISTS premarket_battle_plans (
    id BIGSERIAL PRIMARY KEY,
    plan_date DATE NOT NULL,
    emiten VARCHAR(10) NOT NULL,
    stance VARCHAR(20) NOT NULL,
    trigger_price NUMERIC NOT NULL,
    target_r1 NUMERIC NOT NULL,
    target_max NUMERIC NOT NULL,
    invalidation_price NUMERIC NOT NULL,
    open_15m_vol_threshold BIGINT NOT NULL,
    macro_bias VARCHAR(50) NOT NULL DEFAULT 'NEUTRAL',
    catalyst_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_plan_date_emiten UNIQUE (plan_date, emiten)
);

CREATE INDEX IF NOT EXISTS idx_battle_plans_date ON premarket_battle_plans (plan_date);
```

### 3.4 `intraday_tape_alerts`
Stream of tape, crossing, and volatility anomalies:
```sql
CREATE TABLE IF NOT EXISTS intraday_tape_alerts (
    id BIGSERIAL PRIMARY KEY,
    emiten VARCHAR(10) NOT NULL,
    alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN ('FLOW_VELOCITY_SPIKE', 'CROSSING_DETECTED', 'PRECLOSING_ANOMALY', 'UMA_APPROACH')),
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    trigger_price NUMERIC,
    evidence JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tape_alerts_created_at ON intraday_tape_alerts (created_at DESC);
```

### 3.5 `execution_audits`
Realized execution and slippage tracking:
```sql
CREATE TABLE IF NOT EXISTS execution_audits (
    id BIGSERIAL PRIMARY KEY,
    journal_id BIGINT REFERENCES decision_journal(id) ON DELETE CASCADE,
    emiten VARCHAR(10) NOT NULL,
    trade_date DATE NOT NULL,
    planned_entry NUMERIC NOT NULL,
    executed_entry NUMERIC NOT NULL,
    slippage_ticks INT NOT NULL,
    slippage_pct NUMERIC(6,3) NOT NULL,
    position_size_lots INT NOT NULL,
    allocated_capital NUMERIC NOT NULL,
    actual_exit_price NUMERIC,
    realized_pnl NUMERIC,
    exit_reason VARCHAR(30) CHECK (exit_reason IN ('TARGET_R1', 'TARGET_MAX', 'STOP_LOSS', 'MANUAL_EXIT', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_audits_journal ON execution_audits (journal_id);
```

---

## 4. Deep Module Specifications

### 4.1 Flow Intelligence Engine (`lib/flow/`)

#### Pure Functions in `lib/flow/absorption.ts`
- **Rolling Window Accumulation**: Aggregates net broker values across $W \in \{1, 3, 5, 20\}$ sessions.
- **Top 3 Concentration ($C_W$)**:
  $$C_W = \frac{\sum_{i=1}^3 \text{NetBuyValue}_{i, W}}{\text{TotalBuyValue}_W}$$
- **Accumulation Quality Score (AQS: 0–100)**:
  1. *Concentration Weight (0–30)*:
     - $C_5 \ge 0.50 \implies 30$
     - $0.35 \le C_5 < 0.50 \implies 20$
     - $C_5 < 0.35 \implies 10$
  2. *Flow Persistence (0–30)*:
     - Net value $> 0$ across $T-1$, $T-3$, and $T-5 \implies 30$
     - Net value $> 0$ across 2 of 3 windows $\implies 15$
     - Otherwise $\implies 0$
  3. *Absorption Divergence (0–40)*:
     - $NV_5 > 0$ and $-5\% \le \text{Return}_5 \le +3\%$ (stealth base-building) $\implies 40$
     - $NV_5 > 0$ and $+3\% < \text{Return}_5 \le +15\%$ (standard markup) $\implies 25$
     - $NV_5 > 0$ and $\text{Return}_5 > +15\%$ (late overextended markup) $\implies 10$
     - $NV_5 \le 0$ $\implies 0$
- **Tag Assignment**:
  - $\text{AQS} \ge 75 \implies \text{HEAVY\_ABSORPTION}$
  - $60 \le \text{AQS} < 75 \implies \text{MODERATE\_ABSORPTION}$
  - $40 \le \text{AQS} < 60 \implies \text{NEUTRAL}$
  - $\text{AQS} < 40 \implies \text{DISTRIBUTION}$

#### Divergence Classifier in `lib/flow/divergence.ts`
- Compares Foreign Institutional Net Value ($FFNV_5$) against Retail Net Value ($RNV_5$):
  - `WHALE_ABSORPTION`: $FFNV_5 > \text{Rp } 2\text{B}$ AND $RNV_5 < -\text{Rp } 1.5\text{B}$.
  - `RETAIL_TRAP`: $RNV_5 > \text{Rp } 2\text{B}$ AND $FFNV_5 < -\text{Rp } 1.5\text{B}$.
  - `SYNCHRONIZED_ACCUMULATION`: $FFNV_5 > 0$ AND $DomesticInst_5 > 0$ AND $RNV_5 \le 0$.
  - `DOMESTIC_DRIVEN`: Foreign volume $< 5\%$ of total turnover.

---

### 4.2 Tactical Pre-Market Battle Plan Engine (`lib/tactical/battle-plan.ts`)

- **Schedule**: Every trading day at 08:30 WIB (Asia/Jakarta) via BullMQ cron worker `generate-battle-plan`.
- **Pre-execution Guard**: Invokes `isIdxTradingDay(now)`. If holiday or weekend, exits cleanly with audit log.
- **Signal Aggregation**:
  - Reads active `decision_journal` rows where stance $\in \{\text{'ENTER'}, \text{'WAIT'}\}$.
  - Fetches latest macro snapshot (IHSG bias proxy, USD/IDR spot).
  - Retrieves `flow_absorption_daily` AQS and tags.
- **The $V_{15m}$ Participation Threshold**:
  $$V_{15m} = 0.15 \times \text{AvgDailyVolume}_{20d}$$
  Prevents entry on low-volume fakeouts; the plan marks setups as `CONFIRMING_VOLUME` until 09:15 WIB cumulative volume crosses $V_{15m}$.

---

### 4.3 Intraday Alert & Anomaly Engine (`lib/tape/alert-engine.ts`)

- **Trigger Conditions**:
  1. *Velocity Surge*: $d(\text{BrokerNetVal})/dt$ in first 30 mins $> 3\times$ historical 5-day average with Top 3 concentration $> 60\%$.
  2. *Pasar Nego Crossing*: Volume ratio $V_{NG}/V_{REG} > 0.20$ or Crossing Value $> \text{Rp } 5\text{B}$. Logs premium/discount vs. regular market price.
  3. *Pre-Closing Auction Anomaly*: Price shift $> \pm 3\%$ between 15:50 and 16:00 WIB or $> 10\%$ daily volume transacted in pre-close.
  4. *IDX UMA Risk Radar*: Proximity score $> 85\%$ based on 3-day and 5-day cumulative percentage return acceleration.
- **Persistence**: Real-time write to `intraday_tape_alerts`.

---

### 4.4 Risk Sizer & Slippage Audit Engine (`lib/risk/sizer.ts`)

#### IDX Tick Engine
Official IDX tick table logic:
```ts
export function getIdxTickSize(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}
```

#### Dynamic Sizing Formulation
- Inputs: `accountEquity`, `riskPercentage` (default 1.0%), `plannedEntry`, `invalidationStop`, `buyFeePct` (0.15%), `sellFeePct` (0.25%).
- Total Risk per Share:
  $$\text{Risk}_{\text{share}} = (P_{\text{entry}} - P_{\text{stop}}) + (P_{\text{entry}} \times 0.0015) + (P_{\text{stop}} \times 0.0025)$$
- Lot Sizing:
  $$\text{Lots} = \left\lfloor \frac{\text{accountEquity} \times (\text{riskPercentage} / 100)}{\text{Risk}_{\text{share}} \times 100} \right\rfloor$$
- Max Position Constraint: Lots capped such that $\text{Lots} \times 100 \times P_{\text{entry}} \le 0.20 \times \text{accountEquity}$.

#### Realized Execution & Slippage
- Calculates tick distance: $\text{tick\_distance}(P_{\text{planned}}, P_{\text{executed}})$.
- Computes slippage drag percentage and evaluates execution efficiency:
  $$\text{Efficiency} = \frac{\text{Realized PnL}}{\text{Theoretical PnL}}$$

---

## 5. UI/UX Surface Design

1. **`/radar` Updates**:
   - New tabs: **"Absorption Matrix"** and **"Whale Divergence"**.
   - Table columns: T-1 to T-20 Net Values, Top 3 Concentration, AQS Badge (`HEAVY_ABSORPTION`), and Divergence Tag (`WHALE_ABSORPTION`).
2. **`/desk` Updates**:
   - Pinned **Alert Ribbon** displaying live counts of velocity spikes, crossing blocks, and UMA warnings.
   - Expandable **08:30 WIB Battle Plan Card** at the top of the desk.
   - Interactive **"Size & Execute"** button on each Decision Card opening the Position Sizer modal.
   - Tab for **"Execution & Slippage Audit"** displaying realized PnL vs. theoretical expectancy.

---

## 6. Error Handling & Fail-Closed Boundaries

1. **Network / Ingestion Failure**:
   - If Stockbit API fails during daily EOD capture, `flow_absorption_daily` falls back to the previous session's rolling numbers with a `DATA_STALE` flag.
2. **Holiday / Weekend Skip**:
   - The Battle Plan job verifies `isIdxTradingDay()`. No empty plans are written on non-trading days.
3. **Liquidity Warning**:
   - If requested lots exceed 25% of top 3 bid volume depth, the UI alerts the trader of market impact risk.
4. **Zero-Division Defense**:
   - All concentration and velocity ratios guard denominators with $\epsilon = 10^{-6}$ or zero-volume short-circuits.

---

## 7. Verification & Testing Strategy

- `lib/flow/absorption.test.ts`: Unit test AQS scoring across 0, 40, 60, 75, 100 boundaries; verify rolling concentration.
- `lib/flow/divergence.test.ts`: Verify broker mapping to archetypes; test `WHALE_ABSORPTION` vs `RETAIL_TRAP`.
- `lib/tape/alert-engine.test.ts`: Test velocity spike detection, crossing threshold detection, and pre-closing price shifts.
- `lib/risk/sizer.test.ts`: Verify IDX tick sizes, friction accounting, lot rounding, and 20% capital cap enforcement.
- Integration tests: Verify `/api/radar` and `/api/desk` endpoints return valid contracts.
- Regression standard: All existing 770+ test suites must pass with zero regressions.
