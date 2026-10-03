# Phase 19: Opening Range Breakout (ORB) & Intraday Initial Balance (IB) Engine — Design Specification

> **Status:** APPROVED  
> **Author:** Quantitative Architect & Intraday Microstructure Engineer  
> **Date:** 2026-10-03  
> **Target Release:** v0.23.0 (draft)  

---

## 1. Executive Problem Statement & Market Microstructure Rationale

On the Indonesia Stock Exchange (IDX), continuous trading opens at 09:00 WIB. The opening auction (Pre-Opening 08:45–08:59 WIB) and the immediate opening flurry (09:00–09:15 WIB) concentrate institutional order routing, index rebalancing, and liquidity discovery.

In Auction Market Theory and Market Profile methodology (J. Peter Steidlmayer), the price range established during the opening period is termed the **Initial Balance (IB)**:
1. **15-Minute Initial Balance ($IB_{15}$)**: The High and Low established between 09:00 and 09:15 WIB. This coincides exactly with our Phase 8 & Phase 9 Pre-Market Battle Plan confirmation window ($V_{15m}$).
2. **60-Minute Initial Balance ($IB_{60}$)**: The High and Low established between 09:00 and 10:00 WIB during Session 1.
3. **Range Expansion Factor ($RF$)**:
   $$RF = \frac{\text{Day High} - \text{Day Low}}{IB_{\text{range}}}$$
   Measures whether the market is accepting prices outside the initial balance (directional trend day) or rejecting excursions (mean-reverting rotational day).

When an emiten cleanly breaks above the $IB_{15}$ High with volume exceeding the $V_{15m}$ institutional threshold ($V \ge 0.15 \times \text{ADTV}_{20\text{d}}$), the probability of positive intraday drift is statistically high. Conversely, failed breakouts where price pokes above the $IB$ High and quickly falls back inside the balance signal **responsive institutional selling**, warning traders to avoid chasing.

---

## 2. Mathematical Formulations & Market Day Classification

### 2.1 Initial Balance Calculation
Given 1-minute or 5-minute intraday tick prints or opening session prints:
- $IB_{15\text{h}} = \max_{t \in [09:00, 09:15]} \text{High}(t)$
- $IB_{15\text{l}} = \min_{t \in [09:00, 09:15]} \text{Low}(t)$
- $IB_{15\text{range}} = IB_{15\text{h}} - IB_{15\text{l}}$
- $IB_{15\text{mid}} = \frac{IB_{15\text{h}} + IB_{15\text{l}}}{2}$

### 2.2 Range Expansion Extensions
Fibonacci/institutional extension targets from the Initial Balance:
- **Upper Extension 1 ($R_1$)**: $IB_{\text{high}} + 0.50 \times IB_{\text{range}}$
- **Upper Extension 2 ($R_2$)**: $IB_{\text{high}} + 1.00 \times IB_{\text{range}}$
- **Lower Extension 1 ($S_1$)**: $IB_{\text{low}} - 0.50 \times IB_{\text{range}}$
- **Lower Extension 2 ($S_2$)**: $IB_{\text{low}} - 1.00 \times IB_{\text{range}}$

### 2.3 Market Day Types (Steidlmayer Framework Adapted for IDX)
1. **`TREND_DAY_EXPANSION`**:
   - Price breaks out of $IB_{15}$ within the first 30 minutes, never trades back below $IB_{\text{mid}}$, and reaches $RF \ge 2.0\times$.
   - Direction: Sustained one-way institutional drive.
2. **`NORMAL_VARIATION_DAY`**:
   - Price extends beyond one side of $IB$ by $1.2\times$ to $1.8\times IB_{\text{range}}$.
   - Direction: Moderate institutional extension followed by value acceptance.
3. **`FAILED_BREAKOUT_TRAP`**:
   - Price pokes $\le 3$ ticks above $IB_{\text{high}}$ (or below $IB_{\text{low}}$), fails to hold, and rejects back below $IB_{\text{mid}}$.
   - Direction: Liquidity trap / false breakout.
4. **`NEUTRAL_ROTATIONAL_DAY`**:
   - Price trades both above and below $IB$ bounds slightly, but closes near the middle ($RF \le 1.2\times$).
   - Direction: Non-trending balance.

---

## 3. Confluence Regimes & Tactical Score

1. **`ORB_BULLISH_EXPANSION`** (Score: 90):
   - Price trading above $IB_{15\text{h}}$ with volume $\ge V_{15m}$ and trend aligned with Weekly Stage 2.
2. **`ORB_PULLBACK_RETEST`** (Score: 85):
   - Price broke out above $IB_{15\text{h}}$ and is now pulling back to test the $IB_{15\text{h}}$ level as support.
3. **`INSIDE_IB_COILING`** (Score: 60):
   - Price compressing within the middle third of $IB$ ($[IB_{\text{mid}} - 0.2IB, IB_{\text{mid}} + 0.2IB]$). Awaiting directional breakout.
4. **`ORB_FALSE_BREAKOUT_TRAP`** (Score: 30):
   - Price broke above $IB_{15\text{h}}$ but fell back below $IB_{15\text{mid}}$ with volume dry-up.
5. **`ORB_BEARISH_BREAKDOWN`** (Score: 20):
   - Price breaks below $IB_{15\text{l}}$ with expanding volume.

---

## 4. Architectural Boundaries (Zero-Stance Invariant)

- **Zero-Stance Boundary**: ORB and Initial Balance levels serve strictly as execution timing refinements, intraday invalidation anchors, and tactical filters.
- They **never** bypass Playbook gates G0–G4 or emit independent `ENTER` stances.
- **Fail-Closed Walk-Forward Floor**: Evaluation requires $N \ge 30$ historical out-of-sample trades (`walkforward:orb`).
