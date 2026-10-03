# Phase 13 Specification: Cross-Sector Capital Rotation & Institutional Flow Momentum Matrix

## 1. Executive Summary & Problem Statement

In the Indonesia Stock Exchange (IDX), institutional capital (foreign investment banks and domestic fund managers) does not distribute evenly across all ~900 listed emitens. Instead, capital concentrates and rotates cyclically across distinct macro sectors:
- **Commodities & Energy** (`ENERGY`, `BASIC_MATERIALS`): Driven by global coal, nickel, oil, and CPO benchmark swings.
- **Financial Institutions** (`FINANCIALS`: BBCA, BBRI, BMRI, BBNI): Primary vehicle for aggregate sovereign and macro foreign liquidity.
- **Infrastructure & Telecommunications** (`INFRASTRUCTURE`: TLKM, ISAT, TOWR, PGAS): Defensive and capital-intensive yield plays.
- **Consumer Non-Cyclicals** (`CONSUMER_NON_CYCLICAL`: ICBP, INDF, MYOR, AMRT): Domestic purchasing power and defensive rotation.
- **Industrials, Healthcare, Technology, Properties**: Secondary cyclical satellites.

Trading high-quality Bandarmology setups (G0–G4) in a **Lagging** or **Distributing** sector significantly degrades trade expectancy ($R$-multiple decay, prolonged sideways chop, or failed breakouts). Conversely, trading candidates in a **Leading** or **Accumulating** sector benefits from broad institutional tailwinds that dramatically accelerate moves to Target R1.

Phase 13 delivers the **Cross-Sector Capital Rotation & Institutional Flow Momentum Matrix**, providing:
1. **Benchmark-Normalized Relative Strength ($RS_{\text{sector}}$)** against the Jakarta Composite Index (IHSG).
2. **Sectoral Institutional Net Flow Velocity ($NFV_{\text{sector}}$)** across rolling 5-day, 10-day, and 20-day windows.
3. **Institutional Sector Rotation Quadrant (RRG-Adapted)**:
   - **`LEADING`**: $RS \ge 100 \land NFV > 0$ (Broad institutional accumulation + outperformance).
   - **`WEAKENING`**: $RS \ge 100 \land NFV \le 0$ (Outperforming price but institutional distribution underway).
   - **`LAGGING`**: $RS < 100 \land NFV \le 0$ (Underperforming with continuous net institutional outflow).
   - **`IMPROVING`**: $RS < 100 \land NFV > 0$ (Price lagging but smart money aggressively absorbing supply).
4. **Tactical Confluence Integration**:
   - Emitens in `LEADING` sectors receive a `🌊 Sector Tailwind` badge on `/desk` and pre-market Battle Plans.
   - Emitens in `LAGGING` sectors receive a `⚠️ Sector Headwind` warning, advising tightened invalidation stops.

---

## 2. Invariants & Non-Goals

1. **Zero-Stance Boundary**:
   - Sector Rotation is strictly an **execution confluence overlay and discovery ranking filter**.
   - Sector metrics **never** open positions or mutate Playbook Decision Card gates ($G0$–$G4$) or live trading stances (`ENTER`/`WAIT`/`AVOID`).
   - Sinyal beli tetap wajib lulus rumus kuantitatif Adi Sucipto di `/desk`.
2. **Zero External API Strain**:
   - Operates purely on aggregated daily price history and broker flow snapshots already stored in local PostgreSQL. Zero calls to external market APIs.
3. **Fail-Open Fallback**:
   - If an emiten has an unmapped sector or sparse historical sector data, the system gracefully marks `sectorRegime: 'SECTOR_NEUTRAL'` without crashing or blocking evaluation.
4. **Walk-Forward Verification Floor**:
   - Maintains the repository invariant: sample size floor must be $N \ge 30$ before walk-forward viability can be confirmed (`gateStatus: 'VERDICT_UNREACHABLE'`).

---

## 3. Mathematical Formulations

### 3.1. Sector Relative Strength ($RS$) vs. IHSG
For each sector $S$ on trading date $t$:
$$\text{SectorReturn}_{t, k} = \frac{\overline{P}_{S, t} - \overline{P}_{S, t-k}}{\overline{P}_{S, t-k}} \times 100$$
$$\text{IHSGReturn}_{t, k} = \frac{\text{IHSG}_t - \text{IHSG}_{t-k}}{\text{IHSG}_{t-k}} \times 100$$
$$\text{RS\_Ratio}_{S, t} = 100 \times \left(1 + \frac{\text{SectorReturn}_{t, 20} - \text{IHSGReturn}_{t, 20}}{100}\right)$$
$$\text{RS\_Momentum}_{S, t} = 100 \times \left(1 + \frac{\text{SectorReturn}_{t, 5} - \text{IHSGReturn}_{t, 5}}{100}\right)$$

### 3.2. Sector Institutional Net Flow Velocity ($NFV$)
Aggregates net institutional buying (foreign whales + domestic institutional brokers) across all liquid constituent emitens in sector $S$:
$$NFV_{S, 5d} = \sum_{e \in S} \text{NetInstitutionalFlow}_{e, 5d}$$
$$NFV_{S, 20d} = \sum_{e \in S} \text{NetInstitutionalFlow}_{e, 20d}$$
$$\text{FlowIntensity}_{S} = \frac{NFV_{S, 5d}}{\text{SectorTotalTurnover}_{S, 5d}} \times 100$$

### 3.3. Quadrant Classification Matrix

| Quadrant | RS Condition | Net Flow Condition | Strategic Implication |
|---|---|---|---|
| **`LEADING`** | $RS \ge 100$ | $NFV_{5d} > 0$ | Strongest momentum; aggressive trend continuation; highest win rate on breakouts. |
| **`WEAKENING`** | $RS \ge 100$ | $NFV_{5d} \le 0$ | Momentum cooling; distribution off top; trail stops tightly; do not chase new highs. |
| **`LAGGING`** | $RS < 100$ | $NFV_{5d} \le 0$ | Persistent underperformance and capital flight; avoid long entries. |
| **`IMPROVING`** | $RS < 100$ | $NFV_{5d} > 0$ | Bottom reversal / Phase C spring; smart money accumulating while price is still cheap. |

---

## 4. Architectural Interfaces & Data Contracts

```typescript
export type SectorQuadrant = 'LEADING' | 'WEAKENING' | 'LAGGING' | 'IMPROVING' | 'SECTOR_NEUTRAL';

export interface SectorRotationMetric {
  sector: string;
  asOfDate: string;
  rsRatio: number;
  rsMomentum: number;
  netFlow5d: number;
  netFlow20d: number;
  flowIntensityPct: number;
  quadrant: SectorQuadrant;
  topAccumulatedEmiten?: string;
  constituentCount: number;
}

export interface SectorRotationConfluence {
  sector: string;
  quadrant: SectorQuadrant;
  isTailwind: boolean;
  isHeadwind: boolean;
  summary: string;
  relativeStrengthRank: number;
}
```

---

## 5. Database Schema Migration `033_sector_rotation_flow.sql`

```sql
CREATE TABLE IF NOT EXISTS sector_rotation_daily (
  id BIGSERIAL PRIMARY KEY,
  sector VARCHAR(50) NOT NULL,
  trade_date DATE NOT NULL,
  rs_ratio NUMERIC(8, 2) NOT NULL,
  rs_momentum NUMERIC(8, 2) NOT NULL,
  net_flow_5d NUMERIC(16, 2) NOT NULL,
  net_flow_20d NUMERIC(16, 2) NOT NULL,
  flow_intensity_pct NUMERIC(6, 2) NOT NULL,
  quadrant VARCHAR(20) NOT NULL,
  constituent_count INT NOT NULL DEFAULT 0,
  top_emiten VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sector_rotation UNIQUE (sector, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_sector_rotation_date ON sector_rotation_daily(trade_date DESC, rs_ratio DESC);
```

---

## 6. Verification Deliverables

1. Database migration `033_sector_rotation_flow.sql` and persistence helpers in `lib/db.ts`.
2. Pure mathematical engines:
   - `lib/sector/types.ts`
   - `lib/sector/relative-strength.ts`
   - `lib/sector/matrix-classifier.ts`
   - `lib/sector/index.ts`
3. API route handler `GET /api/radar/sectors/rotation`.
4. Visual UI components `SectorRotationMatrixCard.tsx` with semantic design tokens in `app/globals.css`.
5. Integration into `/radar` and `/desk` Battle Plan cards.
6. Walk-forward verification runner `scripts/run-sector-rotation-walkforward.ts` ($N \ge 30$).
