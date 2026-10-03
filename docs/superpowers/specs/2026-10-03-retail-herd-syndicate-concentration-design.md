# Phase 22: Retail Herd Dispersion, Broker Concentration & Syndicate Asymmetry Engine — Design Specification

> **Status:** APPROVED  
> **Author:** Quantitative Architect & Bandarmology Microstructure Specialist  
> **Date:** 2026-10-03  
> **Target Release:** v0.26.0 (draft)  

---

## 1. Executive Problem Statement & Market Microstructure Rationale

In Indonesian equity Bandarmology, retail market participants exhibit distinct behavioral clustering compared to institutional market makers and syndicate accumulators:
1. **The Retail Herd Signature**:
   - Retail investors predominantly trade through retail-heavy discount brokerages on the Indonesia Stock Exchange: **YP** (Mirae Asset Sekuritas), **PD** (Indo Premier Sekuritas), **XC** (Ajaib Sekuritas), **CC** (Mandiri Sekuritas retail), and **NI** (BNI Sekuritas retail).
   - Retail orders are fragmented across small lot sizes and exhibit high emotional correlation (FOMO buying during vertical green candles, panic selling on initial red wicks).
2. **The Institutional Syndicate Signature**:
   - Institutional whales, foreign investment banks (**AK, BK, CS, RX, ZP**), and domestic market maker syndicates execute coordinated block orders through concentrated broker channels.
   - High institutional accumulation is characterized by **extreme broker concentration** (Top 1 and Top 3 buyers accumulating > 60% of total buy turnover) while retail brokers are either selling or absent.
3. **The Retail Trap (Jebakan Retail)**:
   - When retail brokers (YP + PD + XC) dominate the top buyer list (> 40% of total turnover) while institutional brokers are quietly distributing into retail market orders, the trade setup has negative forward expectancy regardless of technical chart patterns.

Phase 22 formalizes the **Retail Herd Dispersion, Broker Concentration & Syndicate Asymmetry Engine (Retail Herd Index / RHI)**:
- Quantifies net retail flow vs. institutional syndicate concentration.
- Computes the **Syndicate Asymmetry Ratio (SAR)**:
  $$SAR = \frac{\text{NetBuy}(\text{Top 3 Accumulating Brokers})}{\max(1, \text{NetBuy}(\text{Retail Brokers: YP, PD, XC}))}$$
- Calculates the **Retail Herd Index (RHI: 0–100)** to measure retail crowding.

---

## 2. Mathematical Formulations & Index Scoring

### 2.1 Retail vs. Institutional Broker Classification
- **Retail Broker Set ($\mathcal{B}_{\text{retail}}$)**: `['YP', 'PD', 'XC', 'NI', 'CC', 'GR', 'XL']`
- **Foreign / Whale Broker Set ($\mathcal{B}_{\text{whale}}$)**: `['AK', 'BK', 'CS', 'RX', 'ZP', 'KZ', 'CG', 'LG']`
- **Retail Net Buy Value**:
  $$\text{RetailNetValue} = \sum_{b \in \mathcal{B}_{\text{retail}}} \text{NetValue}(b)$$
- **Top-3 Institutional Net Buy Value**:
  $$\text{Top3NetValue} = \sum_{j=1}^3 \text{NetValue}(\text{TopBuyer}_j)$$

### 2.2 Syndicate Asymmetry Ratio ($SAR$)
$$SAR = \frac{\text{Top3NetValue}}{\max(10^7, |\text{RetailNetValue}|)}$$
- $SAR \ge 3.0$ with $\text{RetailNetValue} \le 0$: Extreme institutional accumulation asymmetry (Smart Money accumulating while retail is selling).
- $SAR < 0.8$ with $\text{RetailNetValue} > 0$: Retail dominant crowding (Distribution hazard).

### 2.3 Retail Herd Index (RHI: 0–100)
$$\text{RetailRatio} = \frac{\text{RetailNetValue}}{\text{TotalTurnover}} \times 100$$
$$\text{Top3Ratio} = \frac{\text{Top3NetValue}}{\text{TotalTurnover}} \times 100$$
$$\text{RHI} = \text{clamp}\left(50 + 2.5 \times \text{RetailRatio} - 1.2 \times \text{Top3Ratio},\; 0,\; 100\right)$$
- **$\text{RHI} \ge 75$**: `RETAIL_HERD_FOMO_TRAP` (Retailers are crowded into the stock; high distribution probability).
- **$\text{RHI} \le 30$**: `INSTITUTIONAL_STEALTH_ACCUMULATION` (Retailers are absent or capitulating; institutions quietly accumulating).
- **$30 < \text{RHI} < 75$**: `BALANCED_HERD_FLOW`.

---

## 3. Confluence Regimes & Tactical Score

1. **`INSTITUTIONAL_STEALTH_ACCUMULATION`** (Score: 90):
   - $\text{RHI} \le 30$ and $SAR \ge 2.5$. Top 3 syndicate buyers accumulate while retail brokers sell off. Asymmetric bullish edge.
2. **`SYNDICATE_DOMINANT_FLOW`** (Score: 80):
   - Top 3 buyer concentration $\ge 50\%$ with positive foreign institutional participation and retail participation $\le 15\%$.
3. **`BALANCED_HERD_FLOW`** (Score: 50):
   - Symmetrical retail and institutional order participation.
4. **`RETAIL_HERD_FOMO_TRAP`** (Score: 30):
   - $\text{RHI} \ge 75$ with retail brokers occupying top 3 buyer positions. Extreme risk of holding into institutional distribution.
5. **`RETAIL_PANIC_CAPITULATION`** (Score: 70):
   - Retail net flow is deeply negative ($\text{RetailRatio} \le -25\%$) while price tests key support (Order Block / AVWAP / POC). Smart money absorption zone.

---

## 4. Architectural Boundaries (Zero-Stance Invariant)

- **Zero-Stance Boundary**: Retail Herd Index (RHI) and Syndicate Asymmetry metrics serve strictly as Bandarmology order flow filters and trap avoidance mitigators.
- They **never** bypass Playbook gates G0–G4 or emit independent `ENTER` stances.
- **Fail-Closed Walk-Forward Floor**: Evaluation requires $N \ge 30$ historical out-of-sample trades (`walkforward:rhi`).
