# Phase 17: Institutional Order Blocks, Fair Value Gaps (FVG) & Liquidity Sweep Engine — Design Specification

> **Status:** APPROVED  
> **Author:** Quantitative Architect & Institutional Microstructure Engineer  
> **Date:** 2026-10-03  
> **Target Release:** v0.21.0 (draft)  

---

## 1. Executive Problem Statement & Market Microstructure Rationale

In the continuous trading environment of the Indonesia Stock Exchange (IDX), institutional market makers, domestic asset managers (pension/mutual funds), and foreign investment banks execute large-scale portfolio adjustments that create distinct structural footprints on daily candlestick charts.

Traditional retail technical indicators (RSI, Stochastics, Bollinger Bands) suffer from lag and frequently trigger false breakout signals during institutional stop-hunts. **Smart Money Concepts (SMC)** formalizes the structural mechanisms by which institutional liquidity is deployed, absorbed, and rebalanced:

1. **Bullish Order Blocks (OB)**:
   - The final down-close (bearish) candle immediately preceding an aggressive, high-volume upward impulse that causes a **Break of Structure (BOS)** above a previous swing high.
   - Represents the price zone where institutional algorithms stacked resting buy orders. When price pulls back to retest an **unmitigated** Order Block, resting buy liquidity often absorbs incoming supply, creating high-expectancy bounce reactions.

2. **Fair Value Gaps (FVG / BISI - Buy-side Imbalance Sell-side Inefficiency)**:
   - Occurs during a violent three-candle impulsive sequence where the High of Candle 1 does not overlap with the Low of Candle 3 ($\text{Low}(t) > \text{High}(t-2)$).
   - The gap represents a one-sided liquidity void where only buyers transacted. The auction market mechanism magnetically draws price back to rebalance this inefficiency (mitigate the FVG) before continuing the primary trend.

3. **Liquidity Sweeps (Turtle Soup / Stop-Loss Hunts)**:
   - Price wicks below a significant prior Swing Low (or equal lows / double bottom) to trigger retail stop-loss market orders, but the candle rebounds violently to close back **inside** the prior range.
   - The stop-loss selling provides the requisite liquidity for institutions to fill large buy limit orders without incurring market slippage.

---

## 2. Mathematical Formulations & Algorithmic Identification

### 2.1 Swing Pivots & Market Structure Breaks (BOS / CHoCH)
- **Swing High Pivot ($H_{\text{swing}}$)**: A candle whose High is strictly higher than $k=2$ candles to the left and $k=2$ candles to the right:
  $$\text{High}(t) > \max(\text{High}(t-2), \text{High}(t-1), \text{High}(t+1), \text{High}(t+2))$$
- **Swing Low Pivot ($L_{\text{swing}}$)**: A candle whose Low is strictly lower than $k=2$ candles to the left and $k=2$ candles to the right:
  $$\text{Low}(t) < \min(\text{Low}(t-2), \text{Low}(t-1), \text{Low}(t+1), \text{Low}(t+2))$$
- **Break of Structure (BOS)**: A daily candle closing cleanly above the most recent confirmed Swing High:
  $$\text{Close}(t) > H_{\text{swing}}$$
  with volume confirming the impulse: $\text{Volume}(t) \ge 1.20 \times \text{SMA}_{20}(\text{Volume})$.

### 2.2 Bullish Order Block Identification
A candle at index $t_{\text{OB}}$ qualifies as a **Bullish Order Block** if:
1. Candle $t_{\text{OB}}$ is a down candle: $\text{Close}(t_{\text{OB}}) < \text{Open}(t_{\text{OB}})$.
2. An impulsive sequence within the subsequent 1 to 3 candles triggers a confirmed **BOS** ($\text{Close}(t_{\text{OB}}+j) > H_{\text{swing}}$).
3. The Order Block bounds are defined by:
   - $\text{OB}_{\text{top}} = \text{High}(t_{\text{OB}})$
   - $\text{OB}_{\text{bottom}} = \text{Low}(t_{\text{OB}})$
4. **Mitigation State**:
   - `UNMITIGATED`: Subsequent price action has not touched $\text{OB}_{\text{top}}$.
   - `PARTIALLY_MITIGATED`: Price dipped into $[\text{OB}_{\text{bottom}}, \text{OB}_{\text{top}}]$ and bounced.
   - `INVALIDATED`: Price closed below $\text{OB}_{\text{bottom}}$.

### 2.3 Fair Value Gap (FVG) Formulation
In a 3-candle sequence $[t-2, t-1, t]$:
- **Bullish FVG (BISI)**:
  $$\text{FVG}_{\text{top}} = \text{Low}(t)$$
  $$\text{FVG}_{\text{bottom}} = \text{High}(t-2)$$
  $$\text{GapSizePct} = \frac{\text{FVG}_{\text{top}} - \text{FVG}_{\text{bottom}}}{\text{FVG}_{\text{bottom}}} \times 100$$
  - Condition: $\text{FVG}_{\text{top}} > \text{FVG}_{\text{bottom}}$ and $\text{GapSizePct} \ge 0.5\%$.
- **Consequent Encroachment (CE)**: The $50\%$ midpoint of the FVG zone:
  $$\text{CE} = \frac{\text{FVG}_{\text{top}} + \text{FVG}_{\text{bottom}}}{2}$$
  Institutional algorithms frequently rebalance exactly to the 50% CE level before resuming markup.

### 2.4 Liquidity Sweep Identification
A candle at index $t$ qualifies as a **Bullish Liquidity Sweep** if:
1. $\text{Low}(t) < L_{\text{swing}}$ (wicks below confirmed prior swing low).
2. $\text{Close}(t) \ge L_{\text{swing}}$ (rejects and closes at or above the swing low level).
3. Close position is in the upper half of the candle's range:
   $$\frac{\text{Close}(t) - \text{Low}(t)}{\text{High}(t) - \text{Low}(t)} \ge 0.50$$

---

## 3. Confluence Regimes & Tactical Score

1. **`PRIME_ORDER_BLOCK_DEFENSE`** (Score: 90):
   - Price pulling back into an unmitigated Bullish Order Block that overlaps with a Bullish FVG or Base AVWAP.
2. **`BOS_BULLISH_EXPANSION`** (Score: 85):
   - Confirmed Break of Structure above major swing high with volume surge $\ge 1.25\times$.
3. **`LIQUIDITY_SWEEP_REVERSAL`** (Score: 80):
   - Sweep of prior swing low followed by immediate reclamation and high close.
4. **`FVG_REBALANCING_PULLBACK`** (Score: 70):
   - Price retracing to the 50% Consequent Encroachment of an unmitigated Fair Value Gap.
5. **`BEARISH_STRUCTURE_CHONCH`** (Score: 30):
   - Price breaking down below significant swing low, signaling change of character.

---

## 4. Architectural Boundaries (Zero-Stance Invariant)

- **Zero-Stance Boundary**: Order Blocks, FVGs, and Liquidity Sweeps serve strictly as entry precision refinements, invalidation anchors, and tactical confluences.
- They **never** bypass Playbook gates G0–G4 or emit independent `ENTER` stances.
- **Fail-Closed Walk-Forward Floor**: Evaluation requires $N \ge 30$ historical out-of-sample trades (`walkforward:smc`).
