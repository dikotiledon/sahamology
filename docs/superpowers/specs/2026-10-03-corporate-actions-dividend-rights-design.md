# Phase 20: Corporate Actions, Ex-Date Dividend Arbitrage & Rights Issue Dilution Risk Engine — Design Specification

> **Status:** APPROVED  
> **Author:** Quantitative Architect & Corporate Governance Analyst  
> **Date:** 2026-10-03  
> **Target Release:** v0.24.0 (draft)  

---

## 1. Executive Problem Statement & Market Microstructure Rationale

Corporate actions on the Indonesia Stock Exchange (IDX)—specifically **Cash Dividends**, **Rights Issues (HMETD / Non-HMETD)**, **Stock Splits**, and **Warrants**—are major institutional catalysts that radically alter price microstructure, corporate balance sheets, and trader capital:

1. **The IDX Dividend Trap Hazard**:
   - Indonesian high-dividend stocks (energy miners like PTBA, ITMG, ADRO and major state-owned banks like BBRI, BMRI, BBNI) regularly attract aggressive retail buying prior to the **Cum Dividend Date** (the last date an investor can buy shares to be entitled to the dividend payout).
   - On the subsequent **Ex Dividend Date**, the stock price automatically adjusts downwards. In historical market data, the opening drop on Ex Date often exceeds the net dividend yield ($D_{\text{drop}} > D_{\text{yield}}$), trapping retail holders in deep capital drawdown while incurring a 10% dividend income tax friction.
   - Conversely, the **Pre-Cum Dividend Run-Up Strategy** captures the 15-to-20 trading session momentum leading up to Cum Date, exiting on or immediately before Cum Date to harvest pure capital gains with zero dividend tax liability and zero Ex-Date gap risk.

2. **Rights Issue Dilution & Standby Buyer (Pembeli Siaga) Gating**:
   - Rights issues (Hak Memesan Efek Terlebih Dahulu / HMETD) dilute existing share counts. When companies issue new shares at a steep discount without a credible Standby Buyer, post-rights prices frequently collapse.
   - The engine computes the **Theoretical Ex-Rights Price (Harga Teoritis)**:
     $$P_{\text{theoretical}} = \frac{(S_{\text{old}} \times P_{\text{cum}}) + (S_{\text{new}} \times P_{\text{exercise}})}{S_{\text{old}} + S_{\text{new}}}$$
   - Evaluates Dilution Ratio, Exercise Price Discount, Standby Buyer credibility, and standby absorption risk.

3. **Stock Split & Reverse Split Liquidity Normalization**:
   - Adjusts historical moving averages and fraksi price bands post-split to prevent false volatility spikes or technical indicator distortions.

---

## 2. Mathematical Formulations & Risk Classification

### 2.1 Cash Dividend Metrics & Dividend Trap Scoring
- **Gross Dividend Yield ($Y_{\text{div}}$)**:
  $$Y_{\text{div}} = \frac{\text{Dividend Per Share (DPS)}}{P_{\text{cum}}} \times 100$$
- **Historical Ex-Date Price Drop Ratio ($R_{\text{drop}}$)**:
  $$R_{\text{drop}} = \frac{P_{\text{cum}} - P_{\text{ex\_open}}}{\text{DPS}}$$
  - If $R_{\text{drop}} > 1.0$: Price gap down exceeded gross dividend value (Negative Expectancy Holding).
  - If $R_{\text{drop}} \le 0.8$: Price held value relative to dividend payout (Positive Expectancy Holding).
- **Dividend Trap Risk Score (0–100)**:
  $$\text{TrapScore} = \text{clamp}\left(30 + 5 \times Y_{\text{div}} + 20 \times (R_{\text{drop}} - 1.0) - \text{AQS}_{\text{brosum}} \times 0.3,\; 0,\; 100\right)$$
  - High score ($\ge 70$): **`DIVIDEND_TRAP_HAZARD`** (Avoid holding through Ex Date).
  - Low score ($< 40$): **`SAFE_DIVIDEND_ACCUMULATION`**.

### 2.2 Days to Corporate Action Horizon
- $T_{\text{cum}}$: Trading sessions remaining until Cum Date.
  - If $5 \le T_{\text{cum}} \le 20$ with Brosum $\text{AQS} \ge 65$: **`PRE_CUM_RUNUP_EXPANSION`** (Harvest momentum before Ex Date).
  - If $T_{\text{cum}} = 0$ (Cum Date session): **`CUM_DATE_EXIT_WARNING`** (Advise exiting to avoid Ex Date gap).
  - If $T_{\text{ex}} \le 3$ (Immediate Ex Date): **`POST_EX_REACTION_WATCH`**.

### 2.3 Rights Issue Dilution Ratio & Pricing
- **Dilution Percentage**:
  $$\text{DilutionPct} = \frac{S_{\text{new}}}{S_{\text{old}} + S_{\text{new}}} \times 100$$
- **Exercise Discount Percentage**:
  $$\text{DiscountPct} = \frac{P_{\text{market}} - P_{\text{exercise}}}{P_{\text{market}}} \times 100$$

---

## 3. Confluence Regimes & Tactical Score

1. **`PRE_CUM_RUNUP_EXPANSION`** (Score: 90):
   - Strong institutional accumulation ($5 \le T_{\text{cum}} \le 20$, $\text{AQS} \ge 65$, Yield $\ge 4\%$). Momentum play into Cum Date.
2. **`POST_EX_ABSORPTION_BOUNCE`** (Score: 80):
   - Stock has passed Ex Date ($1 \le T_{\text{ex}} \le 3$), gap down has settled near key support (OB/AVWAP/POC), and institutional smart money is re-accumulating.
3. **`NEUTRAL_CORPORATE_ACTION`** (Score: 50):
   - No imminent corporate actions within 30 trading sessions.
4. **`RIGHTS_ISSUE_STANDBY_SECURED`** (Score: 65):
   - Rights issue with credible top-tier Standby Buyer and modest dilution ($< 25\%$).
5. **`DIVIDEND_TRAP_HAZARD`** (Score: 30):
   - High nominal yield ($> 7\%$), historical Ex-Date drop $> 1.1\times$, and weak broker accumulation. High risk of holding through Ex Date.
6. **`UNSECURED_RIGHTS_DILUTION_RISK`** (Score: 20):
   - Massive share dilution ($> 40\%$) at deep discount without committed standby buyer. Severe capital erosion risk.

---

## 4. Architectural Boundaries (Zero-Stance Invariant)

- **Zero-Stance Boundary**: Corporate action dates, dividend trap scores, and rights issue ratios serve strictly as event filters, catalyst overlays, and risk mitigators.
- They **never** bypass Playbook gates G0–G4 or emit independent `ENTER` stances.
- **Fail-Closed Walk-Forward Floor**: Evaluation requires $N \ge 30$ historical out-of-sample corporate action trade outcomes (`walkforward:corp`).
