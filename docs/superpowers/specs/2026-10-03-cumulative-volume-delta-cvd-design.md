# Phase 21: Cumulative Volume Delta (CVD), Foreign Tape Aggression & Absorption Engine — Design Specification

> **Status:** APPROVED  
> **Author:** Quantitative Architect & Order Flow Microstructure Specialist  
> **Date:** 2026-10-03  
> **Target Release:** v0.25.0 (draft)  

---

## 1. Executive Problem Statement & Market Microstructure Rationale

In modern electronic order matching on the Indonesia Stock Exchange (IDX), candlestick charts and raw volume histograms display the *quantity* of shares transacted, but conceal the *aggression* behind the transactions:
1. **Aggressive vs. Passive Orders**:
   - **Aggressive market orders** cross the bid-ask spread to demand immediate liquidity: hitting the bid (HAKI / Hajar Kiri - aggressive selling) or lifting the offer (HAKA / Hajar Kanan - aggressive buying).
   - **Passive limit orders** provide liquidity by resting on the orderbook queue.
2. **Order Flow Absorption Footprints**:
   - In accumulation phases, institutional Smart Money rarely chases price aggressively; instead, they place massive passive buy limit orders on the bid queue that **absorb** retail panic selling. The candlestick prints lower lows or a flat range, while aggressive seller delta is completely swallowed.
   - Conversely, in distribution phases, retail FOMO buyers aggressively lift the offer (high market buy volume), but institutional market makers passively match those buys with limit sells, preventing upward price expansion (**Exhaustion Divergence**).

Phase 21 formalizes the **Cumulative Volume Delta (CVD) Proxy, Foreign Tape Aggression & Passive Absorption Engine**:
- Computes single-bar volume delta proxies using close location and bar displacement math.
- Accumulates multi-session **Cumulative Volume Delta (CVD)** across rolling 20-session and 50-session windows.
- Quantifies **Foreign Tape Aggression Ratio**:
  $$\text{ForeignAggressionRatio} = \frac{\text{ForeignBuyValue}}{\max(1, \text{ForeignBuyValue} + \text{ForeignSellValue})}$$
- Detects order flow divergences:
  - **Bullish CVD Absorption**: Lower price low + Higher CVD low.
  - **Bearish CVD Exhaustion**: Higher price high + Lower CVD high.

---

## 2. Mathematical Formulations & Order Flow Divergences

### 2.1 Bar Volume Delta Proxy Formulation
For each daily or intraday price bar $t$ with Open, High, Low, Close, and Volume:
- If $\text{High}(t) == \text{Low}(t)$ (flat bar): $\Delta V(t) = 0$.
- Bar Range: $R(t) = \text{High}(t) - \text{Low}(t)$.
- Directional Displacement: $D(t) = \text{Close}(t) - \text{Open}(t)$.
- Close Location Value (CLV $\in [-1.0, 1.0]$):
  $$\text{CLV}(t) = \frac{(\text{Close}(t) - \text{Low}(t)) - (\text{High}(t) - \text{Close}(t))}{R(t)} = \frac{2 \times \text{Close}(t) - (\text{High}(t) + \text{Low}(t))}{R(t)}$$
- Volume Delta Proxy ($\Delta V(t)$):
  $$\Delta V(t) = \text{Volume}(t) \times \left( 0.60 \times \text{CLV}(t) + 0.40 \times \frac{D(t)}{R(t)} \right)$$

### 2.2 Rolling Cumulative Volume Delta (CVD)
For lookback window $N$ (e.g. 20 sessions):
$$\text{CVD}(t) = \sum_{i=t-N+1}^t \Delta V(i)$$
- **Normalized CVD Delta Ratio**:
  $$\text{DeltaRatio}(t) = \frac{\text{CVD}(t)}{\sum_{i=t-N+1}^t \text{Volume}(i)} \times 100 \quad (\in [-100\%, 100\%])$$

### 2.3 Foreign Tape Aggression Ratio
From daily foreign trading statistics:
$$\text{ForeignAggressionRatio} = \frac{\text{NetForeignBuyValue} + \text{ForeignSellValue}}{\text{TotalForeignTurnover}} \quad \text{or} \quad \frac{\text{ForeignBuy}}{\text{ForeignBuy} + \text{ForeignSell}}$$
- $\text{Ratio} \ge 0.65$: Strong Institutional Buyer Aggression (Dominant HAKA).
- $\text{Ratio} \le 0.35$: Strong Institutional Seller Aggression (Dominant HAKI).
- $0.35 < \text{Ratio} < 0.65$: Balanced Order Flow.

### 2.4 Order Flow Divergence Classifier
Over a rolling 10-to-20 session pivot window:
1. **`BULLISH_CVD_ABSORPTION`**:
   - Price condition: $\text{Price}(t) \le \text{Price}(t-k)$ (Price making equal or lower trough).
   - CVD condition: $\text{CVD}(t) > \text{CVD}(t-k) + 0.15 \times |\text{CVD}(t-k)|$ (CVD making higher trough).
   - Institutional meaning: Passive smart money limit bids are completely absorbing aggressive retail selling.
2. **`BEARISH_CVD_EXHAUSTION`**:
   - Price condition: $\text{Price}(t) \ge \text{Price}(t-k)$ (Price making equal or higher peak).
   - CVD condition: $\text{CVD}(t) < \text{CVD}(t-k) - 0.15 \times |\text{CVD}(t-k)|$ (CVD making lower peak).
   - Institutional meaning: Upward price expansion lacks aggressive market buy support; retail buyers are being met by passive institutional limit asks.

---

## 3. Confluence Regimes & Tactical Score

1. **`BULLISH_CVD_ABSORPTION`** (Score: 90):
   - Confirmed absorption divergence where price tests key support while cumulative delta expands upward. Prime reversal/continuation confluence.
2. **`AGGRESSIVE_MARKET_MARKUP`** (Score: 85):
   - Harmonic expansion: Price and CVD both surging in unison, Foreign Aggression $\ge 0.65$.
3. **`NEUTRAL_DELTA_ROTATION`** (Score: 50):
   - Delta ratio near zero ($\pm 10\%$) with balanced bid/ask order matching.
4. **`BEARISH_CVD_EXHAUSTION`** (Score: 30):
   - Price printing new highs into unconfirmed CVD divergence. High risk of bull trap / exhaustion reversal.
5. **`AGGRESSIVE_MARKET_MARKDOWN`** (Score: 20):
   - Price and CVD breaking down simultaneously, Foreign Aggression $\le 0.35$. Dominant institutional liquidation.

---

## 4. Architectural Boundaries (Zero-Stance Invariant)

- **Zero-Stance Boundary**: CVD proxies, aggression ratios, and absorption divergences serve strictly as order flow confluence overlays and tactical timing refinements.
- They **never** bypass Playbook gates G0–G4 or emit independent `ENTER` stances.
- **Fail-Closed Walk-Forward Floor**: Evaluation requires $N \ge 30$ historical out-of-sample trades (`walkforward:cvd`).
