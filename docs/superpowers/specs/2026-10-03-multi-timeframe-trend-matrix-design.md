# Phase 18: Multi-Timeframe Alignment & Institutional Trend Matrix — Design Specification

> **Status:** APPROVED  
> **Author:** Quantitative Architect & Senior Microstructure Engineer  
> **Date:** 2026-10-03  
> **Target Release:** v0.22.0 (draft)  

---

## 1. Executive Problem Statement & Market Microstructure Rationale

In quantitative equity trading on the Indonesia Stock Exchange (IDX), a pervasive defect in single-timeframe daily trading systems is **counter-trend vulnerability**:
1. An emiten may print a valid daily breakout setup, an apparent Order Block retest, or a volume surge on a single daily bar, while being trapped inside a dominant **Weekly Stage 4 Downtrend** ($\text{Price} < \text{EMA}_{10\text{w}} < \text{EMA}_{30\text{w}}$). In such environments, daily breakouts frequently fail as institutional selling supply caps any temporary markup, resulting in sharp bull traps and premature stop-outs.
2. Conversely, when an emiten's **Weekly Tide** is in confirmed **Stage 2 Expansion**, daily pullbacks into daily support shelves (Order Blocks, Anchored VWAP, or Volume Profile POC) exhibit exceptional follow-through with reduced maximum adverse excursion (MAE).

Phase 18 implements the **Multi-Timeframe Alignment & Institutional Trend Matrix Engine**, adapting Stan Weinstein's Stage Analysis and Alexander Elder's Triple Screen System for IDX equities:
- **Higher Timeframe (Screen 1: The Weekly Tide)**: Aggregates daily trading history into synthetic weekly bars to assess macro secular momentum ($\text{EMA}_{10\text{w}}$, $\text{EMA}_{30\text{w}}$, Weinstein Stages 1–4).
- **Intermediate Timeframe (Screen 2: The Daily Wave)**: Evaluates daily market structure, moving average alignments ($\text{EMA}_{20}$, $\text{SMA}_{50}$, $\text{SMA}_{200}$), and institutional flow persistence.
- **Confluence Matrix**: Synthesizes the relationship between the Weekly Tide and the Daily Wave into deterministic multi-timeframe regimes with position sizing scaling multipliers.

---

## 2. Mathematical Formulations & Multi-Timeframe Logic

### 2.1 Synthetic Weekly Bar Aggregation
From sequential daily price bars $[d_1, d_2, \dots, d_N]$:
- Group daily bars by calendar year and ISO week number.
- For each completed week $w$:
  - $\text{Open}_w = \text{Open}(\text{first trading day of week } w)$
  - $\text{High}_w = \max_{d \in w}(\text{High}_d)$
  - $\text{Low}_w = \min_{d \in w}(\text{Low}_d)$
  - $\text{Close}_w = \text{Close}(\text{last trading day of week } w)$
  - $\text{Volume}_w = \sum_{d \in w} \text{Volume}_d$
  - $\text{Value}_w = \sum_{d \in w} \text{Value}_d$

### 2.2 Weekly Trend & Stage Classification (Weinstein Method)
- **Weekly Exponential Moving Averages**:
  $$\text{EMA}_{10\text{w}} = \text{EMA}(\text{Close}_w, 10), \quad \text{EMA}_{30\text{w}} = \text{EMA}(\text{Close}_w, 30)$$
- **Weekly Trend Slope ($\Delta \text{EMA}_{30\text{w}}$)**:
  $$\text{Slope}_{30\text{w}} = \frac{\text{EMA}_{30\text{w}}(t) - \text{EMA}_{30\text{w}}(t-4)}{\text{EMA}_{30\text{w}}(t-4)} \times 100$$
- **Weinstein Stage Classifications**:
  1. **`STAGE_2_EXPANSION`**:
     - $\text{Close}_w > \text{EMA}_{10\text{w}} > \text{EMA}_{30\text{w}}$ AND $\text{Slope}_{30\text{w}} > 0$.
     - Strong secular markup driven by institutional accumulation.
  2. **`STAGE_1_BASING`**:
     - $|\text{Slope}_{30\text{w}}| \le 1.0\%$ AND price oscillating around $\text{EMA}_{30\text{w}}$ within a $\pm 8\%$ band.
     - Quiet accumulation base prior to stage transition.
  3. **`STAGE_3_DISTRIBUTION`**:
     - Price volatile around flattening $\text{EMA}_{30\text{w}}$ after an extended Stage 2 advance, with $\text{EMA}_{10\text{w}}$ crossing below $\text{EMA}_{30\text{w}}$.
     - Institutional profit-taking and distribution.
  4. **`STAGE_4_CAPITULATION`**:
     - $\text{Close}_w < \text{EMA}_{10\text{w}} < \text{EMA}_{30\text{w}}$ AND $\text{Slope}_{30\text{w}} < 0$.
     - Severe secular downtrend; high risk of cascade liquidation.

### 2.3 Daily Trend Evaluation
- **Daily Exponential Moving Averages**: $\text{EMA}_{20}$, $\text{SMA}_{50}$, $\text{SMA}_{200}$.
- **Daily Trend State**:
  - `BULLISH`: $\text{Price} > \text{EMA}_{20} > \text{SMA}_{50}$.
  - `PULLBACK`: $\text{SMA}_{50} < \text{Price} \le \text{EMA}_{20}$ (healthy digestion).
  - `BEARISH`: $\text{Price} < \text{EMA}_{20}$ and $\text{Price} < \text{SMA}_{50}$.

---

## 3. Multi-Timeframe Alignment Regimes & Sizing Multipliers

| Alignment Regime | Weekly State | Daily State | Score | Sizing Multiplier | Tactical Advisory |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`PERFECT_TIDE_ALIGNMENT`** | Stage 2 Expansion | Bullish Markup | 95 | $1.00\times$ (Full) | Macro tide and daily impulse in complete harmony; full sizing authorized. |
| **`HIGH_PROBABILITY_PULLBACK`** | Stage 2 Expansion | Pullback to Support | 85 | $1.00\times$ (Full) | Secular bull market pullback into daily support (OB / AVWAP / POC); prime entry. |
| **`RANGE_BOUND_COMPRESSION`** | Stage 1 Basing | Neutral / Range | 60 | $0.65\times$ (Dampened) | Base forming; wait for confirmed Stage 2 breakout before full commitment. |
| **`COUNTER_TREND_TRAP_HAZARD`** | Stage 4 Capitulation | Bullish / Pop | 35 | $0.40\times$ (Defensive) | Daily strength is counter-trend against macro weekly bear; beware bull trap. |
| **`SECULAR_LIQUIDATION`** | Stage 4 Capitulation | Bearish Breakdown | 15 | $0.00\times$ (Avoid) | Both weekly and daily timeframes breaking down; strict capital preservation. |
| **`MIXED_TRANSITION`** | Stage 3 or Mixed | Transition | 50 | $0.50\times$ (Moderate) | Structural transition; reduced risk budget. |

---

## 4. Architectural Boundaries (Zero-Stance Invariant)

- **Zero-Stance Boundary**: Multi-timeframe alignment scores and sizing multipliers operate strictly as pre-market discovery filters, execution sizing scalers, and risk mitigators.
- They **never** mutate core Playbook Decision Card gates ($G0$–$G4$) or emit independent `ENTER` stances.
- **Fail-Closed Walk-Forward Floor**: Evaluation requires $N \ge 30$ historical out-of-sample trades (`walkforward:mtf`).
