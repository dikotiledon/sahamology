# Phase 14: Volatility Contraction Pattern (VCP) & Minervini Trend Template Engine

## 1. Executive Summary & Problem Statement

In the Indonesian equity market (IDX), momentum breakouts frequently trap retail traders when entered without structural volatility contraction and institutional accumulation backing. Standard breakout strategies suffer high failure rates when price expands abruptly out of wide, erratic consolidations where sellers have not yet been exhausted.

Phase 14 introduces the **Volatility Contraction Pattern (VCP) & Minervini Trend Template Engine (SEPA for IDX)**. Formulated by US Investing Champion Mark Minervini and adapted specifically for Indonesian equities, this engine identifies institutional absorption through progressive contractions in price volatility (decreasing pullback depth $T_1 > T_2 > T_3 > T_4$) coupled with volume drying up to extreme lows before an explosive breakout.

### Core Objectives
1. **Minervini Trend Template (Stage 2 Gating)**: Verifies that the emiten is operating in a confirmed institutional Stage 2 uptrend ($\text{Price} > \text{SMA}_{50} > \text{SMA}_{150} > \text{SMA}_{200}$ with an upward-sloping 200-day moving average).
2. **Progressive Contraction Detector**: Algorithmically scans 30 to 120-day consolidations to detect 2 to 4 distinct contraction waves with diminishing percentage depths (e.g., $-20\% \to -10\% \to -4\%$).
3. **Volume Dry-Up Quantification**: Measures supply exhaustion during the final contraction wave ($V_{\text{contraction}} \le 0.60 \times \text{SMA}_{50}(V)$), signaling that overhead supply has dried up.
4. **Cheat / Pivot Breakout Level**: Computes the exact pivot breakout price and establishes an asymmetric invalidation stop loss anchored directly beneath the low of the final tightest contraction wave (typically offering $2\%$ to $5\%$ risk vs. $15\%$ to $30\%$ upside).
5. **Confluence Matrix with Brosum AQS & Wyckoff**: Pairs VCP structural tightness with Phase 8 Brosum Accumulation Quality Score ($\text{AQS} \ge 65$), Phase 10 Wyckoff markup phases, and Phase 11 Volume Profile Value Area.

---

## 2. Mathematical Formulations & Pattern Logic

### 2.1 Minervini Trend Template (6-Point Verification)
For an emiten with daily price series $P(t)$ and volume series $V(t)$ over at least 200 trading sessions:
1. **Price Above Moving Averages**:
   $$P_{\text{current}} > \text{SMA}_{50}(t) \quad \text{and} \quad P_{\text{current}} > \text{SMA}_{150}(t) \quad \text{and} \quad P_{\text{current}} > \text{SMA}_{200}(t)$$
2. **Moving Average Alignment**:
   $$\text{SMA}_{50}(t) > \text{SMA}_{150}(t) > \text{SMA}_{200}(t)$$
3. **Rising 200-Day Slope**:
   $$\text{SMA}_{200}(t) - \text{SMA}_{200}(t - 20) > 0$$
4. **Proximity to 52-Week High**:
   $$\frac{\text{High}_{52w} - P_{\text{current}}}{\text{High}_{52w}} \le 0.25 \quad (\text{within } 25\% \text{ of 52-week high})$$
5. **Distance from 52-Week Low**:
   $$\frac{P_{\text{current}} - \text{Low}_{52w}}{\text{Low}_{52w}} \ge 0.25 \quad (\text{at least } 25\% \text{ above 52-week low})$$
6. **Relative Strength Indicator**:
   Outperformance vs. Jakarta Composite Index (IHSG) over the preceding 60 sessions.

### 2.2 Volatility Contraction Pattern (VCP) Structure
The consolidation base spanning $M$ bars ($30 \le M \le 120$) is partitioned into successive swing cycles $(H_k, L_k)$ where $k \in \{1, \dots, N\}$ ($2 \le N \le 4$):
- **Wave Contraction Depth**:
  $$D_k = \frac{H_k - L_k}{H_k} \times 100$$
- **Progressive Dampening Invariant**:
  Each successive wave must exhibit strictly lower volatility:
  $$D_1 > D_2 > \dots > D_N$$
  Typical benchmark depths for IDX:
  - $T_1$: $15\% - 35\%$
  - $T_2$: $8\% - 18\%$
  - $T_3$: $3\% - 9\%$
  - $T_4$ (optional): $1\% - 4\%$
- **Volume Contraction (Dry-Up)**:
  Let $V_{\text{final}}$ be the average volume of the final contraction wave $N$:
  $$\text{VolumeDryUpRatio} = \frac{V_{\text{final}}}{\text{SMA}_{50}(V)}$$
  A valid VCP dry-up requires $\text{VolumeDryUpRatio} \le 0.60$ (indicating at least a 40% contraction in volume).

### 2.3 Pivot Level & Risk Sizing
- **Breakout Pivot Price ($P_{\text{pivot}}$)**:
  $$P_{\text{pivot}} = H_N \quad (\text{the peak of the final contraction wave})$$
- **Invalidation Stop Loss ($P_{\text{stop}}$)**:
  $$P_{\text{stop}} = L_N - \text{Fraksi}(L_N) \quad (\text{one tick below the trough of the final wave})$$
- **Asymmetric Risk ($R_{\text{pct}}$)**:
  $$R_{\text{pct}} = \frac{P_{\text{pivot}} - P_{\text{stop}}}{P_{\text{pivot}}} \times 100$$
  In a high-grade VCP, $R_{\text{pct}} \le 5.0\%$, enabling large lot positioning while honoring portfolio risk constraints.

---

## 3. Database Architecture (`supabase/034_vcp_pattern_daily.sql`)

```sql
CREATE TABLE IF NOT EXISTS vcp_patterns_daily (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  trend_template_passed BOOLEAN NOT NULL DEFAULT FALSE,
  sma_50 NUMERIC(12, 2),
  sma_150 NUMERIC(12, 2),
  sma_200 NUMERIC(12, 2),
  pct_from_52w_high NUMERIC(6, 2),
  pct_from_52w_low NUMERIC(6, 2),
  contraction_count INT NOT NULL DEFAULT 0,
  contractions JSONB NOT NULL DEFAULT '[]'::jsonb,
  pivot_price NUMERIC(12, 2),
  stop_loss_price NUMERIC(12, 2),
  volume_dry_up_ratio NUMERIC(6, 2),
  vcp_stage VARCHAR(30) NOT NULL DEFAULT 'DEVELOPING',
  confluence_tag VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vcp_emiten_date UNIQUE (emiten, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_vcp_date_stage 
  ON vcp_patterns_daily(trade_date DESC, vcp_stage);
```

---

## 4. Architectural Boundaries & Non-Negotiable System Invariants

1. **Zero-Stance Mutation Boundary**:
   VCP pattern detection operates purely as a discovery screening tool, tactical execution confluence badge, and risk-compression guide. It must **never** mutate core Playbook Decision Card gates ($G0$–$G4$) or independently flip live trading stances (`ENTER`/`WAIT`/`AVOID`).
2. **Local PostgreSQL Computation**:
   All moving averages, swing pivots, and volume dry-up ratios are computed strictly from local `price_history` data without querying upstream external APIs during live UI loads.
3. **Fail-Closed Walk-Forward Protocol ($N \ge 30$)**:
   The statistical walk-forward evaluator `scripts/run-vcp-walkforward.ts` returns `VERDICT_UNREACHABLE` (`INSUFFICIENT_OUT_OF_SAMPLE_SIZE`) until 30 forward live trades are logged.
