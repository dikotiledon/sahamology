# Phase 15: IDX Market Breadth & Composite Liquidity Engine (IHSG Pulse)

## 1. Executive Summary & Problem Statement

The Jakarta Composite Index (IHSG) on the Indonesia Stock Exchange (IDX) is market-capitalization weighted, rendering it vulnerable to distortion by a small cluster of mega-cap conglomerates (e.g. BBCA, BBRI, BMRI, BREN, AMMN, BYAN, TLKM, ASII).

In Indonesian trading practice, **Index Divergence Traps** frequently inflict severe drawdowns on retail and institutional swing traders:
- IHSG marks new cyclical highs or remains ostensibly stable, while underlying market participation deteriorates rapidly (e.g., fewer than $35\%$ of stocks trading above their 50-day moving average, while the Advance-Decline line plunges). Breakout setups (such as VCP or Wyckoff markups) have high failure rates during such distribution phases.
- Conversely, during severe market sell-offs, extreme oversold capitulation breadth ($\le 15\%$ stocks above 50 SMA) signals imminent institutional liquidity thrust reversals before the headline index reflects a turnaround.

Phase 15 introduces the **IDX Market Breadth & Composite Liquidity Engine (IHSG Pulse)**, formalizing exchange-wide Advance/Decline ratios, moving average participation percentages ($> \text{EMA}_{20}$, $> \text{SMA}_{50}$, $> \text{SMA}_{200}$), 52-week High/Low expansion spreads, aggregate foreign net flow velocity, and an automated IHSG Market Health Regime classifier (`BULLISH_EXPANSION`, `HEALTHY_PULLBACK`, `BREADTH_DIVERGENCE_WARNING`, `BEARISH_DISTRIBUTION`, `OVERSOLD_CAPITULATION`).

---

## 2. Quantitative Formulations & Regime Classifier

### 2.1 Advance / Decline Mechanics
For an analyzed universe of $N$ actively traded IDX emitens on trade date $t$:
- Advancers $A(t)$: $\text{Count}(P_{\text{close}} > P_{\text{prevClose}})$
- Decliners $D(t)$: $\text{Count}(P_{\text{close}} < P_{\text{prevClose}})$
- Unchanged $U(t)$: $\text{Count}(P_{\text{close}} = P_{\text{prevClose}})$
- Advance / Decline Ratio ($AD_{\text{ratio}}$):
  $$AD_{\text{ratio}}(t) = \frac{A(t)}{\max(1, D(t))}$$
- Net Advances:
  $$\Delta AD(t) = A(t) - D(t)$$

### 2.2 Moving Average Participation Breadth
Quantifies the percentage of universe constituents trading above key institutional moving averages:
- Short-term momentum breadth ($> \text{EMA}_{20}$):
  $$\% > \text{EMA}_{20} = \frac{\text{Count}(P > \text{EMA}_{20})}{N} \times 100$$
- Intermediate swing trend breadth ($> \text{SMA}_{50}$):
  $$\% > \text{SMA}_{50} = \frac{\text{Count}(P > \text{SMA}_{50})}{N} \times 100$$
- Macro structural bull/bear breadth ($> \text{SMA}_{200}$):
  $$\% > \text{SMA}_{200} = \frac{\text{Count}(P > \text{SMA}_{200})}{N} \times 100$$

### 2.3 52-Week High / Low Expansion
- New 52-Week Highs ($NH$): stocks within $2\%$ of their trailing 250-day high.
- New 52-Week Lows ($NL$): stocks within $2\%$ of their trailing 250-day low.
- Net High / Low Spread:
  $$\text{NetNewHighs} = NH - NL$$

### 2.4 IHSG Market Health Regime Classification
Market regimes are classified into five distinct operational states:

| Regime Identifier | Quantitative Trigger Thresholds | Tactical Operational Directive |
| :--- | :--- | :--- |
| **`BULLISH_EXPANSION`** | $\% > \text{SMA}_{50} \ge 60\%$, $AD_{\text{ratio}} \ge 1.25$, $\text{NetNewHighs} \ge 0$ | Broad market participation. Full sizing authorized ($100\%$). High breakout follow-through. |
| **`HEALTHY_PULLBACK`** | $\% > \text{SMA}_{50} \ge 50\%$, $\% > \text{EMA}_{20} < 40\%$, $\% > \text{SMA}_{200} \ge 50\%$ | Intermediate trend bullish, short-term oversold. Buy support tests (POC shelves, Wyckoff Phase C). |
| **`BREADTH_DIVERGENCE_WARNING`** | IHSG trend flat/up, but $\% > \text{SMA}_{50} < 45\%$ and $\text{NetNewHighs} < -5$ | Extreme hazard. Avoid chasing new breakouts. Tighten trailing stops. |
| **`BEARISH_DISTRIBUTION`** | $\% > \text{SMA}_{50} < 40\%$, $AD_{\text{ratio}} < 0.85$, $\text{NetNewHighs} < -10$ | Broad distribution across sectors. Reduce position size by 50%. High cash posture. |
| **`OVERSOLD_CAPITULATION`** | $\% > \text{SMA}_{50} \le 15\%$, $\% > \text{EMA}_{20} \le 15\%$ | Extreme panic exhaustion. Prepare watchlists for institutional accumulation reversal. |

---

## 3. Database Architecture (`supabase/035_market_breadth_daily.sql`)

```sql
CREATE TABLE IF NOT EXISTS market_breadth_daily (
  id BIGSERIAL PRIMARY KEY,
  trade_date DATE NOT NULL UNIQUE,
  advancers INT NOT NULL DEFAULT 0,
  decliners INT NOT NULL DEFAULT 0,
  unchanged INT NOT NULL DEFAULT 0,
  ad_ratio NUMERIC(6, 2) NOT NULL DEFAULT 1.0,
  pct_above_ema20 NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
  pct_above_sma50 NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
  pct_above_sma200 NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
  new_highs_52w INT NOT NULL DEFAULT 0,
  new_lows_52w INT NOT NULL DEFAULT 0,
  net_foreign_flow NUMERIC(16, 2) NOT NULL DEFAULT 0.0,
  market_regime VARCHAR(40) NOT NULL DEFAULT 'BULLISH_EXPANSION',
  regime_score INT NOT NULL DEFAULT 50,
  constituent_count INT NOT NULL DEFAULT 0,
  advisory TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_breadth_date_regime 
  ON market_breadth_daily(trade_date DESC, market_regime);
```

---

## 4. Architectural Boundaries & Invariants

1. **Zero-Stance Mutation Boundary**:
   Market breadth serves as an environment health overlay and risk advisory. It must **never** mutate Playbook Decision Card gates ($G0$–$G4$) or independently flip live trading stances (`ENTER`/`WAIT`/`AVOID`).
2. **Local PostgreSQL Computation**:
   Calculated strictly from local `price_history` and `broker_flow_daily` records without querying external APIs during live UI requests.
3. **Fail-Closed Walk-Forward Protocol ($N \ge 30$)**:
   The statistical walk-forward evaluator `scripts/run-market-breadth-walkforward.ts` returns `VERDICT_UNREACHABLE` (`INSUFFICIENT_OUT_OF_SAMPLE_SIZE`) until 30 verified forward sessions are logged.
