# Phase 11 Specification: Volume Profile Shelves & Intraday Liquidity Distribution Engine (POC / VAH / VAL)

## 1. Executive Summary & Problem Statement

Sahamology's quantitative Bandarmology engine calculates target upside levels (`targetRealistis1`, `targetMax`) and stop loss levels based on Adi Sucipto's formula and historical volatility ATR. However, in professional institutional trading, price movement is governed by the **Auction Market Theory**: markets move from one area of high liquidity consensus (High Volume Shelf) through areas of low liquidity (Low Volume Voids) to seek the next consensus.

Without Volume Profile analytics:
1. Traders risk entering positions directly inside a **Low Volume Node (LVN)** where price lacks support and can experience severe slippage.
2. Traders lack confirmation whether the bandar's estimated accumulation average (`rataRataBandar`) corresponds to the true **Point of Control (POC)** of the multi-week trading range.
3. Traders have no quantitative measure of the **Value Area (VAH / VAL)**—the price range containing 70% of traded volume—to determine whether an emiten is trading at a fair institutional price (inside Value Area) or extended (outside Value Area).

Phase 11 delivers a pure quantitative Volume Profile engine that aggregates volume-by-price across standard IDX Fraksi Harga bins over customizable lookback windows (10d, 20d, 60d), computes the Point of Control (POC), Value Area High (VAH), Value Area Low (VAL), and detects institutional liquidity shelves.

---

## 2. Invariants & Non-Goals

1. **Zero-Stance Boundary**:
   - Volume Profile metrics (POC, VAH, VAL, HVN, LVN) are strictly **execution confluence and contextual risk indicators**.
   - Volume Profile signals **never** mutate Playbook Decision Card gates ($G0$–$G4$) and **never** independently promote a setup to `ENTER`.
   - Setup qualification for execution remains anchored to Adi Sucipto's Bandarmology gates on `/desk`.
2. **Zero External API Strain**:
   - Volume Profile calculations are derived purely from existing stored historical price bars (`price_history`) and daily broker flow records.
   - Zero additional real-time queries to Stockbit's rate-limited upstream API.
3. **Official IDX Fraksi Harga Alignment**:
   - Volume bins must strictly conform to official IDX tick brackets:
     * `< Rp 200`: Rp 1 tick
     * `Rp 200 – Rp 499`: Rp 2 tick
     * `Rp 500 – Rp 1,999`: Rp 5 tick
     * `Rp 2,000 – Rp 4,999`: Rp 10 tick
     * `≥ Rp 5,000`: Rp 25 tick
   - Bin widths adapt dynamically to price levels, ensuring zero discretization distortion.
4. **Fail-Closed Walk-Forward Protocol**:
   - Preserves the repository invariant requiring $N \ge 30$ historical out-of-sample setups before an edge verdict can be verified.

---

## 3. Mathematical Foundations

### 3.1. Discrete Price-Volume Discretization
Given daily price bars with Open, High, Low, Close, and Volume:
For each bar $t$ with range $[\text{Low}_t, \text{High}_t]$ and volume $V_t$:
The volume is distributed across discrete price levels $p \in [\text{Low}_t, \text{High}_t]$ matching valid IDX fraksi increments:

$$\Delta(p) = \text{getIdxTickSize}(p)$$

For each price tick $p_k$:
$$V(p_k) = \sum_{t} \frac{V_t}{M_t} \cdot \mathbf{1}_{\{p_k \in [\text{Low}_t, \text{High}_t]\}}$$
where $M_t$ is the number of valid tick increments within $[\text{Low}_t, \text{High}_t]$.

### 3.2. Point of Control (POC)
The Point of Control is the discrete price level $p_{\text{POC}}$ possessing the single highest accumulated volume:

$$p_{\text{POC}} = \arg\max_{p_k} V(p_k)$$

### 3.3. Value Area Calculation (70% Volume Enclosure)
In Auction Market Theory, the Value Area encapsulates one standard deviation ($\approx 68.27\%$, standardized to $70.0\%$) of the total traded volume around the Point of Control:

1. Let $V_{\text{total}} = \sum_{k} V(p_k)$. Target volume $V_{\text{target}} = 0.70 \times V_{\text{total}}$.
2. Initialize Value Area with the POC: $V_{\text{VA}} = V(p_{\text{POC}})$, $\text{VA} = \{p_{\text{POC}}\}$.
3. Iteratively expand two price steps above and two price steps below:
   * Evaluate the sum of the next 2 ticks above vs. the next 2 ticks below.
   * Add the pair with the greater volume to the Value Area:
     $$V_{\text{VA}} \leftarrow V_{\text{VA}} + \max(V_{\text{above}}, V_{\text{below}})$$
4. Repeat until $V_{\text{VA}} \ge V_{\text{target}}$.
5. Set:
   $$\text{VAH} = \max(\text{VA}), \quad \text{VAL} = \min(\text{VA})$$

### 3.4. High Volume Nodes (HVN) & Low Volume Nodes (LVN)
- **High Volume Node (HVN)**: Any local price peak where volume exceeds $1.5\times$ the local 5-bin moving average. Represents an **institutional accumulation shelf** that offers price support on pullbacks.
- **Low Volume Node (LVN)**: Any price valley where volume drops below $0.5\times$ the local 5-bin moving average. Represents an **auction void** where price tends to move with high velocity and minimal friction.

### 3.5. Liquidity Confluence Status
Given a planned entry price $P_{\text{entry}}$:
- `INSIDE_VALUE_AREA`: $\text{VAL} \le P_{\text{entry}} \le \text{VAH}$ (Fair price consensus).
- `ABOVE_VALUE_AREA`: $P_{\text{entry}} > \text{VAH}$ (Auction markup / expansion).
- `BELOW_VALUE_AREA`: $P_{\text{entry}} < \text{VAL}$ (Deep value / discount).
- `AT_POC_SUPPORT`: $|P_{\text{entry}} - p_{\text{POC}}| \le 2 \times \text{tickSize}$ (Maximum institutional consensus backing).
- `IN_LOW_VOLUME_VOID`: $P_{\text{entry}}$ coincides with an LVN (High slippage warning).

---

## 4. Architectural Interfaces & Data Contracts

### 4.1. Core Types (`lib/volume-profile/types.ts`)
```typescript
export interface VolumeBin {
  price: number;
  volume: number;
  volumePct: number;
  isPoc: boolean;
  isValueArea: boolean;
  isHvn: boolean;
  isLvn: boolean;
}

export interface VolumeProfileResult {
  emiten: string;
  asOfDate: string;
  lookbackDays: number;
  totalVolume: number;
  pocPrice: number;
  vahPrice: number;
  valPrice: number;
  valueAreaVolumePct: number;
  bins: VolumeBin[];
  hvnShelves: number[];
  lvnVoids: number[];
  confluence: {
    status: 'AT_POC_SUPPORT' | 'INSIDE_VALUE_AREA' | 'ABOVE_VALUE_AREA' | 'BELOW_VALUE_AREA' | 'IN_LOW_VOLUME_VOID';
    summary: string;
  };
}
```

---

## 5. Database Persistence (`supabase/031_volume_profile_shelves.sql`)

```sql
CREATE TABLE IF NOT EXISTS volume_profile_snapshots (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  as_of_date DATE NOT NULL,
  lookback_days INT NOT NULL DEFAULT 20,
  poc_price NUMERIC(12, 2) NOT NULL,
  vah_price NUMERIC(12, 2) NOT NULL,
  val_price NUMERIC(12, 2) NOT NULL,
  total_volume NUMERIC(20, 0) NOT NULL,
  hvn_shelves JSONB NOT NULL DEFAULT '[]'::jsonb,
  lvn_voids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_volume_profile_emiten_date_lookback UNIQUE (emiten, as_of_date, lookback_days)
);

CREATE INDEX IF NOT EXISTS idx_volume_profile_emiten ON volume_profile_snapshots(emiten, as_of_date);
```

---

## 6. Implementation Deliverables

1. **Migration 031 & DB Queries**: `supabase/031_volume_profile_shelves.sql` & `lib/db.ts`.
2. **Pure Math Modules**: `lib/volume-profile/types.ts`, `lib/volume-profile/calculator.ts`, `lib/volume-profile/confluence.ts`.
3. **API Endpoint**: `GET /api/radar/volume-profile`.
4. **UI Visual Component**: `app/components/VolumeProfileCard.tsx` with semantic CSS tokens in `app/globals.css`.
5. **Surface Integration**: `/radar` emiten detail modal & `/desk` battle plan cards.
6. **Walk-Forward Evaluator**: `scripts/run-volume-profile-walkforward.ts` ($N \ge 30$).
