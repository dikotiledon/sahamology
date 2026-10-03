# Phase 16: Anchored VWAP (AVWAP) & Institutional Broker Benchmark Engine — Design Specification

> **Status:** APPROVED  
> **Author:** Quantitative Architect & Trading Systems Engineer  
> **Date:** 2026-10-03  
> **Target Release:** v0.20.0 (draft)  

---

## 1. Executive Problem Statement & Quantitative Rationale

In institutional equity trading on the Indonesia Stock Exchange (IDX), algorithmic order execution mandates handled by foreign execution houses (AK, BK, KZ, ZP, CC, RX) and domestic institutional fund managers (NI, LG, OD) are measured against Volume-Weighted Average Price (VWAP) benchmarks.

When institutional actors accumulate a substantial position over days or weeks, their true economic cost basis is determined by their cumulative volume-weighted prices. Traditional static horizontal supports fail to capture where institutional capital is committed over time.

**Anchored VWAP (AVWAP)** solves this by calculating the volume-weighted average price starting from significant psychological and liquidity anchor points:
1. **Accumulation Base Anchor (Lowest Trough in 60d)**: Economic average price of all volume transacted since the current structural accumulation cycle began.
2. **Whale Volume Climax Anchor**: Economic average price of volume transacted since the highest turnover bar in the past 60 trading days (institutional footprint bar).
3. **52-Week High Anchor**: Economic breakeven of all trapped overhead supply transacted since the 52-week peak.
4. **Broker Summary Bandar VWAP (Composite Broker Basis)**: The weighted average price of the top-3 and top-5 accumulating brokers derived from End-of-Day broker summary records.

---

## 2. Mathematical Formulations & Multi-Band Volatility Channels

### 2.1 Anchored VWAP Formula
For a price series starting from an anchor date index $t_0$ to current date $T$:

$$P_{\text{typical}}(t) = \frac{\text{High}(t) + \text{Low}(t) + \text{Close}(t)}{3}$$

$$\text{AVWAP}(t_0, T) = \frac{\sum_{t=t_0}^{T} \left(P_{\text{typical}}(t) \times \text{Volume}(t)\right)}{\sum_{t=t_0}^{T} \text{Volume}(t)}$$

### 2.2 Volume-Weighted Standard Deviation Bands ($\pm 1\sigma, \pm 2\sigma$)
Measures standard deviation of prices weighted by transaction volume from the anchor:

$$\sigma_{\text{VWAP}} = \sqrt{\frac{\sum_{t=t_0}^{T} \left(\text{Volume}(t) \times \left(P_{\text{typical}}(t) - \text{AVWAP}(t_0, T)\right)^2\right)}{\sum_{t=t_0}^{T} \text{Volume}(t)}}$$

- **Upper Band $+1\sigma$**: $\text{AVWAP} + 1.0 \times \sigma_{\text{VWAP}}$
- **Lower Band $-1\sigma$**: $\text{AVWAP} - 1.0 \times \sigma_{\text{VWAP}}$
- **Upper Band $+2\sigma$**: $\text{AVWAP} + 2.0 \times \sigma_{\text{VWAP}}$ (Overextended value exhaustion)
- **Lower Band $-2\sigma$**: $\text{AVWAP} - 2.0 \times \sigma_{\text{VWAP}}$ (Undervalued liquidity pocket)

### 2.3 Broker Summary Bandar VWAP Formulation
From multi-day broker summary data for top accumulating brokers $B_1, \dots, B_k$:

$$\text{BandarVWAP}_{k} = \frac{\sum_{i=1}^{k} \text{NetBuyValue}(B_i)}{\sum_{i=1}^{k} \text{NetBuyLot}(B_i) \times 100}$$

Where 1 lot = 100 shares on the IDX.

---

## 3. Confluence States & Tactical Interpretation

The AVWAP engine classifies price position relative to institutional benchmarks into 5 deterministic interaction regimes:

1. **`AT_INSTITUTIONAL_DEFENSE`**: Current price is holding within $\pm 1.5\%$ of the Base AVWAP or Bandar VWAP on below-average volume. Whales are defending their cost basis. Premium low-risk entry opportunity.
2. **`ABOVE_ALL_ANCHORS_EXPANSION`**: Current price is trading above Base AVWAP, Volume Climax AVWAP, and 52-week High AVWAP. Overhead supply is zero; clear air for markup.
3. **`OVEREXTENDED_VALUE_EXHAUSTION`**: Price exceeds $+2.0\sigma$ above Base AVWAP. Risk of mean reversion towards the institutional benchmark is elevated. Avoid chasing.
4. **`TRAPPED_BELOW_CLIMAX`**: Price is trading below the Volume Climax AVWAP. Trapped buyers from the high-volume bar represent overhead resistance.
5. **`INSTITUTIONAL_CAPITULATION_BREAKDOWN`**: Price drops $> 2.0\%$ below Base AVWAP and Bandar VWAP. Invalidation of accumulation thesis.

---

## 4. Architectural Boundaries (Zero-Stance Invariant)

- **Execution Confluence Only**: AVWAP metrics serve strictly as dynamic support/resistance levels, entry refinement targets, and trailing invalidation anchors.
- **Zero Live Stance Mutation**: AVWAP never bypasses Playbook G0–G4 or flips live trading stances (`ENTER`, `WAIT`, `AVOID`) independently.
- **Fail-Closed Walk-Forward Floor**: Evaluation requires $N \ge 30$ historical out-of-sample trades before passing the gate.
