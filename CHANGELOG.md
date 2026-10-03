# Changelog

Riwayat lengkap perubahan Sahamology. 3 versi terbaru selalu ditampilkan di [README.md](README.md#changelog); versi yang lebih lama diarsipkan di sini.

### Unreleased / v0.19.0 (draft) — Phase 15: IDX Market Breadth & Composite Liquidity Engine (IHSG Pulse)

Phase 15 introduces the **IDX Market Breadth & Composite Liquidity Engine (IHSG Pulse)**, formalizing systemic market participation tracking to separate broad-based institutional accumulation from heavyweight conglomerate index masking on the Indonesia Stock Exchange.

- **Relational Schema (`supabase/035_market_breadth_daily.sql`)**:
  - `market_breadth_daily`: Time-series table tracking `trade_date`, `advancers`, `decliners`, `unchanged`, `ad_ratio`, `pct_above_ema20`, `pct_above_sma50`, `pct_above_sma200`, `new_highs_52w`, `new_lows_52w`, `net_foreign_flow`, `market_regime`, `regime_score`, `constituent_count`, and `advisory`.
  - Unique constraint on `trade_date` and composite index `idx_breadth_date_regime`.
- **Market Breadth & Regime Engine (`lib/breadth/`)**:
  - `types.ts`: Defines `MarketBreadthMetric`, `MarketRegime`, and `BreadthConstituent`.
  - `calculator.ts`: Computes advance/decline metrics, Advance/Decline ratio, percentage of stocks above key moving averages ($> \text{EMA}_{20}$, $> \text{SMA}_{50}$, $> \text{SMA}_{200}$), 52-week High/Low expansion spread, and aggregated total foreign net flow.
  - `regime-classifier.ts`: Classifies market environment into 5 deterministic regimes (`BULLISH_EXPANSION`, `HEALTHY_PULLBACK`, `BREADTH_DIVERGENCE_WARNING`, `BEARISH_DISTRIBUTION`, `OVERSOLD_CAPITULATION`).
- **Database Persistence Helpers (`lib/db.ts`)**:
  - `saveMarketBreadthSnapshot`, `getLatestMarketBreadthSnapshot`, `getMarketBreadthHistory`.
- **API & UI Surfaces**:
  - `GET /api/radar/breadth`: Exposes daily market breadth metrics and historical trends with fail-open fallback.
  - `MarketBreadthCard.tsx`: Interactive component featuring Advance/Decline ratio meter, moving average breadth progress bars, 52-week High/Low expansion status, foreign flow liquidity summary, and architectural boundary notices.
  - Mounted on `/desk` above the tactical battle plans and on `/radar` above the sector rotation matrix.
  - Enriched `BattlePlanCard.tsx` with top-level `📊 Breadth: {regime} ({score}/100)` status badge.
- **Walk-forward Evaluation Gate**:
  - CLI `npm run walkforward:breadth` (`scripts/run-market-breadth-walkforward.ts`) enforcing out-of-sample sample floor ($N \ge 30$).

### Unreleased / v0.18.0 (draft) — Phase 14: Volatility Contraction Pattern (VCP) & Minervini Trend Template Engine

Phase 14 introduces the **Volatility Contraction Pattern (VCP) & Minervini Trend Template Engine (SEPA for IDX)**, formalizing institutional supply absorption via progressive contraction waves ($T_1 > T_2 > T_3 > T_4$), volume dry-up quantification ($\le 0.60 \times \text{SMA}_{50}(V)$), cheat/pivot breakout triggers, asymmetric invalidation stops, and Minervini Stage 2 Trend Template gating.

- **Relational Schema (`supabase/034_vcp_pattern_daily.sql`)**:
  - `vcp_patterns_daily`: Time-series table tracking `emiten`, `trade_date`, `trend_template_passed`, `sma_50`, `sma_150`, `sma_200`, `pct_from_52w_high`, `pct_from_52w_low`, `contraction_count`, `contractions` JSONB, `pivot_price`, `stop_loss_price`, `volume_dry_up_ratio`, `vcp_stage`, and `confluence_tag`.
  - Composite unique constraint `(emiten, trade_date)` and chronological index `idx_vcp_date_stage`.
- **VCP & Trend Template Core Engine (`lib/vcp/`)**:
  - `trend-template.ts`: Evaluates Minervini's 6-point Stage 2 criteria ($\text{Price} > \text{SMA}_{50} > \text{SMA}_{150} > \text{SMA}_{200}$, $\text{SMA}_{200}$ slope upward $\ge 20$ sessions, within $25\%$ of 52-week high, $\ge 25\%$ above 52-week low).
  - `contraction-detector.ts`: Identifies 2 to 4 progressive contraction waves with diminishing pullback depths ($D_1 > D_2 > D_3$), volume dry-up ratio ($V_{\text{final}} / \text{SMA}_{50}(V)$), breakout pivot price ($P_{\text{pivot}}$), and tight invalidation stop ($P_{\text{stop}}$) 1 tick below final contraction trough.
  - `confluence.ts`: Evaluates multi-factor confluence with Brosum AQS ($\ge 65$), Wyckoff phase, and Volume Profile Point of Control.
- **API & UI Surfaces**:
  - `GET /api/radar/vcp`: Exposes single emiten VCP assessment and universe-wide candidate screening.
  - `VcpPatternCard.tsx`: Interactive component displaying contraction wave progress meters, execution pivot/stop grid, Minervini 6-point checklist, and architectural boundary notices.
  - Mounted on `/radar` in the emiten detail inspection drawer; integrated VCP pivot badge (`🎯 VCP: Rp X.XXX`) into `BattlePlanCard.tsx` on `/desk`.
- **Walk-forward Evaluation Gate**:
  - CLI `npm run walkforward:vcp` (`scripts/run-vcp-walkforward.ts`) enforcing out-of-sample sample floor ($N \ge 30$).

### Unreleased / v0.17.0 (draft) — Phase 13: Cross-Sector Capital Rotation & Institutional Flow Matrix

Phase 13 introduces the **Cross-Sector Capital Rotation & Institutional Flow Momentum Matrix Engine**, formalizing Relative Strength ($RS$) benchmarking against IHSG, multi-session sectoral foreign net flow velocity ($5d, 20d$), RRG-adapted institutional quadrant classification (`LEADING`, `IMPROVING`, `WEAKENING`, `LAGGING`), and tactical execution confluence for the Discovery Radar and Pre-Market Battle Plan.

- **Relational Schema (`supabase/033_sector_rotation_flow.sql`)**:
  - `sector_rotation_daily`: Time-series table tracking `sector`, `trade_date`, `rs_ratio`, `rs_momentum`, `net_flow_5d`, `net_flow_20d`, `flow_intensity_pct`, `quadrant`, `constituent_count`, and `top_emiten`.
  - Composite primary key `(sector, trade_date)` and chronological index `idx_sector_rotation_date`.
- **Sector Relative Strength & Flow Momentum Engine (`lib/sector/`)**:
  - `relative-strength.ts`: Computes Sector vs. IHSG $RS_{\text{ratio}} = (\text{Sector} / \text{IHSG}) \times 100$, 10-day moving average $RS_{\text{momentum}}$, outperformance spread, and constituent flow aggregation.
  - `matrix-classifier.ts`: Classifies sectors into deterministic quadrants (`LEADING`, `IMPROVING`, `WEAKENING`, `LAGGING`) based on RS threshold ($100.0$) and 5-day net institutional flow direction.
  - Evaluates tactical confluence: tags constituent emitens with `SECTOR TAILWIND` (`🌊`) or `SECTOR HEADWIND` (`⚠️`) advisories without violating fail-closed zero-stance boundaries.
- **API & UI Surfaces**:
  - `GET /api/radar/sectors/rotation`: Exposes universe-wide sector rotation snapshots and targeted single-sector confluence evaluations.
  - `SectorRotationMatrixCard.tsx`: Interactive dashboard component featuring quadrant filter tabs (`Semua Sektor`, `LEADING`, `IMPROVING`, `WEAKENING`, `LAGGING`), tactical confluence advisory banner, 4-column responsive grid, and architectural boundary notices.
  - Mounted on `/radar` below sectoral institutional distribution cards; integrated sector quadrant badges into `BattlePlanCard.tsx` on `/desk`.
- **Walk-forward Evaluation Gate**:
  - CLI `npm run walkforward:sector` (`scripts/run-sector-rotation-walkforward.ts`) enforcing out-of-sample sample floor ($N \ge 30$).

### Unreleased / v0.16.0 (draft) — Phase 12: Cognitive Post-Trade Journal & Trader Discipline Engine

Phase 12 introduces the **Cognitive Post-Trade Journal & Execution Discipline Engine**, formalizing post-trade execution audits, behavioral deviation detection (FOMO Chase, Stop Widening, Premature Exit, Oversizing, Revenge Trading), quantitative discipline scoring ($0$–$100$), and automated psychological capital tracking with Trader Tilt Lockout protection.

- **Relational Schema (`supabase/032_cognitive_journal.sql`)**:
  - `cognitive_trade_reviews`: Audits linked to `decision_journal(id)` capturing discipline score, grade (`MASTER_DISCIPLINE`, `DISCIPLINED`, `SLIPPY_DISCIPLINE`, `TILT_VIOLATION`), detected deviations, psychological state, and trader reflections.
  - `trader_tilt_state`: Singleton tracking current psychological capital percentage ($0$–$100\%$), consecutive violations, rolling tilt state (`NORMAL`, `CAUTION`, `TILT_LOCKOUT`), and lockout cooldown timestamps.
- **Behavioral Deviation & Tilt Engine (`lib/cognitive/`)**:
  - `auditor.ts`: Evaluates execution against planned trigger, stop, and position sizing. Flags FOMO entry slippage ($> 2$ ticks), stop-loss widening ($> 1$ tick past invalidation), premature exit ($< 50\%$ to target with trend intact), oversizing ($> 15\%$ excess lots), and revenge trades ($< 30$ min after stop-out).
  - `tilt-detector.ts`: Evaluates rolling tilt escalation based on psychological capital and penalty accumulation, recommending risk reduction ($50\%$ position size) on `CAUTION` and total trading lockout on `TILT_LOCKOUT`.
- **API & UI Surfaces**:
  - `GET/POST /api/desk/cognitive-review`: Evaluates execution audits and returns updated trader tilt state.
  - `CognitiveJournalCard.tsx`: Dark/light themed component with discipline score gauge, deviation severity pills, psychological state selectors, and prominent Tilt Lockout advisory banners mounted directly on `/desk`.
- **Walk-forward Evaluation Gate**:
  - CLI `npm run walkforward:cognitive` (`scripts/run-cognitive-discipline-walkforward.ts`) enforcing $N \ge 30$ sample floor.

### Unreleased / v0.15.0 (draft) — Phase 11: Volume Profile Liquidity Shelves & Value Area Confluence

Phase 11 introduces **Volume Profile Liquidity Shelves & Value Area Confluence**, formalizing discrete intraday volume-by-price accumulation, Point of Control (POC) shelf identification, 70% Value Area (VAH, VAL) calculation via Auction Market Theory, and high/low volume node liquidity clustering.

- **Relational Schema (`supabase/031_volume_profile_shelves.sql`)**:
  - `volume_profile_shelves_daily`: Daily time-series tracking emiten POC price, VAH, VAL, total volume, Value Area volume, and JSONB price bins.
- **Volume Profile Engine (`lib/volume-profile/`)**:
  - Fraksi-aligned price binning conforming strictly to official IDX tick brackets (Rp 1 to Rp 25).
  - Iterative 70% Value Area expansion starting from Point of Control (POC).
  - High Volume Node (HVN) shelf and Low Volume Node (LVN) void clustering with trade setup confluence (`AT_POC_SUPPORT`, `IN_LOW_VOLUME_VOID`, `ABOVE_VALUE_AREA`).
- **API & UI Surfaces**:
  - `GET /api/radar/volume-profile`: Computes and caches volume profile distributions per emiten.
  - `VolumeProfileCard.tsx`: Interactive horizontal volume distribution histogram with POC, VAH, and VAL markers.
  - Mounted in `/radar` emiten detail inspection drawer; POC shelf levels embedded into pre-market battle plans on `/desk`.
- **Walk-forward Evaluation Gate**:
  - CLI `npm run walkforward:vp` (`scripts/run-volume-profile-walkforward.ts`) enforcing $N \ge 30$ sample floor.

### Unreleased / v0.14.0 (draft) — Phase 10: Wyckoff Structural Screener & Volume Spread Analysis

Phase 10 introduces the **Wyckoff Structural Screener & Volume Spread Analysis (VSA) Engine**, identifying trading range boundaries (Ice & Creek), structural market events (Selling Climax, Spring, Sign of Strength, Upthrust), and master phase transitions (Phase A through E) with Brosum AQS confluence.

- **Relational Schema (`supabase/030_wyckoff_structure.sql`)**:
  - `wyckoff_structures_daily`: Stores detected trading ranges, support (Ice), resistance (Creek), current phase, structural events, and breakout status.
- **Wyckoff & VSA Engine (`lib/wyckoff/`)**:
  - Multi-bar spread analysis, relative volume ratios ($V / \text{SMA}_{20}(V)$), and close position normalization ($0$ to $1$).
  - Structural pivot detection for Ice support and Creek resistance levels.
  - Automated event detection: Selling Climax (`SC`), Spring test (`SPRING`), Sign of Strength (`SOS`), and Upthrust (`UT`/`UTAD`).
  - Phase state classifier: `PHASE_A_STOPPING`, `PHASE_B_ABSORPTION`, `PHASE_C_TEST`, `PHASE_D_MARKUP_RANGE`, `PHASE_E_MARKUP`.
- **API & UI Surfaces**:
  - `GET /api/radar/wyckoff`: Returns emiten structural diagnostics and phase classifications.
  - `WyckoffSchematicCard.tsx`: Schematic visualization component displaying Ice/Creek price levels, active phase badges, and structural event logs on `/radar` and `/desk`.
- **Walk-forward Evaluation Gate**:
  - CLI `npm run walkforward:wyckoff` (`scripts/run-wyckoff-walkforward.ts`) enforcing $N \ge 30$ sample floor.

### Unreleased / v0.13.0 (draft) — Phase 9: Macro Dynamic Overlay & Tranche Execution

Phase 9 introduces the **Macro Dynamic Overlay & Multi-Account Tranche Execution Engine**, formalizing Bank Indonesia interest rate decision tracking, Rupiah spot pressure metrics, macro-adjusted pre-market risk bands, and phased order tranche decomposition for institutional-scale IDX trade sizing.

- **Relational Schema (`supabase/029_macro_tranche_lifecycle.sql`)**:
  - `bi_rate_decisions`: Registry storing Bank Indonesia RDG policy announcements, benchmark rates (e.g. 6.00%), previous rates, and action tags (`HOLD`, `HIKE`, `CUT`).
  - `macro_pressure_daily`: Daily time-series tracking USD/IDR spot velocity ($\Delta \%_{5d}, \Delta \%_{20d}$), Rupiah Pressure Index (RPI: 0–100), and macro regime tags (`MACRO_HEADWIND`, `MACRO_NEUTRAL`, `MACRO_TAILWIND`).
  - `execution_tranches`: Granular order schedule linked to `execution_audits(id)` capturing planned vs. executed lots, session targets, and tick slippage per execution slice.
- **Dynamic Macro Overlay Engine (`lib/tactical/macro-overlay.ts`)**:
  - Evaluates Rupiah spot velocity against the 16,200 and 16,500 psychological risk levels.
  - Automatically classifies regimes: `MACRO_HEADWIND`, `MACRO_TAILWIND`, or `MACRO_NEUTRAL`.
  - Dynamically adjusts Pre-Market Battle Plans during HEADWIND: tightens stop distance by 15% and increases $V_{15m}$ liquidity confirmation volume to $20\%$ ADTV ($1.33\times$ base).
  - Fail-open invariant: Missing macro data gracefully falls back to `MACRO_NEUTRAL` without interrupting trade operations.
- **Multi-Account Tranche Sizing Engine (`lib/risk/tranche-sizer.ts`)**:
  - Automatically decomposes large institutional allocations into 3 phased market sessions:
    - **Tranche 1 (30%)**: Opening auction & $V_{15m}$ confirmation (09:00–09:15 WIB).
    - **Tranche 2 (40%)**: Continuous session pullback toward Bandar Average (10:00–14:30 WIB).
    - **Tranche 3 (30%)**: Pre-closing auction accumulation follow-through (15:50–16:00 WIB).
  - Strictly enforces the IDX single-order cap (50,000 lots) and evaluates queue depth ratios, flagging `HIGH_MARKET_IMPACT` and recommending TWAP execution when orders exceed $2\times$ average queue depth.
- **API & UI Surfaces**:
  - `GET /api/macro/pressure`: Exposes live RPI score, spot velocities, and latest BI-Rate decision status.
  - Extended `GET /api/desk/battle-plan`: Injects `macroOverlay` and macro-adjusted stop/volume levels into battle plan rows.
  - Extended `POST /api/desk/execution-audit`: Persists planned and executed tranches directly into `execution_tranches`.
  - `PositionSizerModal.tsx`: Adds interactive "Pecah Order (Tranche)" schedule view with tranche breakdown, lot percentages, and slippage estimates.
  - `BattlePlanCard.tsx`: Displays active Macro Overlay badges (`⚠️ Macro Headwind`, `🌊 Macro Tailwind`) with contextual market advisory banners.
- **Seed Utilities**:
  - CLI `npm run seed:bi-rates` (`scripts/seed-bi-rates.ts`): Seeds Bank Indonesia 2026 RDG rate decisions and policy statements.

### Unreleased / v0.12.0 (draft) — Phase 8: The Institutional Trading Lifecycle

Phase 8 introduces the **Institutional Trading Lifecycle**, formalizing multi-day supply absorption, participant archetype divergence, pre-market tactical planning, block crossings, dynamic IDX lot sizing, and post-trade execution audits.

- **Relational Schema (`supabase/028_institutional_lifecycle.sql`)**:
  - `broker_archetypes`: Registry mapping IDX broker codes to institutional whales, domestic institutions, proprietary desks, or retail crowds.
  - `flow_absorption_daily`: Rolling multi-window broker values (1d, 3d, 5d, 20d), Top 3 concentration, Accumulation Quality Score (AQS: 0–100), and absorption tagging.
  - `premarket_battle_plans`: 08:30 WIB pre-market setups with early $V_{15m}$ liquidity confirmation thresholds.
  - `intraday_tape_alerts`: Logs velocity surges, Pasar Nego crossing blocks, pre-closing auction deviations, and UMA radar flags.
  - `execution_audits`: Linked to `decision_journal(id)` (nullable) capturing planned vs. executed price, tick slippage, fee friction, and realized efficiency ratios.
- **Multi-Window Brosum Absorption (`lib/flow/absorption.ts`)**:
  - Deterministic Accumulation Quality Score (AQS: 0–100) combining rolling Top 3 concentration (0–30 pts), multi-window flow persistence (0–30 pts), and price consolidation absorption (0–40 pts).
  - Tags: `HEAVY_ABSORPTION` ($\ge 75$), `MODERATE_ABSORPTION` ($\ge 50$), `NEUTRAL` ($\ge 30$), and `DISTRIBUTION` ($< 30$).
- **Foreign vs. Domestic Divergence Tracker (`lib/flow/divergence.ts`)**:
  - Dynamic ADTV-scaled threshold: $\text{Effective Whale Threshold} = \max(\text{IDR } 500,000,000,\; 0.10 \times \text{ADTV}_{20d})$, eliminating nominal penny-stock distortions.
  - Regimes: `WHALE_ABSORPTION`, `RETAIL_TRAP`, `SYNCHRONIZED_ACCUMULATION`, and `DOMESTIC_DRIVEN`.
- **08:30 WIB Tactical Pre-Market Battle Plan (`lib/tactical/battle-plan.ts`)**:
  - Automatically evaluates active ENTER and WAIT setups before the 09:00 WIB opening bell.
  - $V_{15m}$ Volume Rule: $V_{15m} = \text{round}(0.15 \times \text{AvgDailyVolume}_{20d})$ to filter out low-liquidity fakeouts.
  - Integrated Jakarta calendar guard skipping weekends and official IDX exchange holidays.
- **Intraday Tape Alert & Crossing Engine (`lib/tape/alert-engine.ts`)**:
  - Compliant with IDX continuous trading broker code masking: operates strictly on **aggregate foreign flow acceleration** ($> 3.0\times$ run rate) and **Pasar Nego crossing reports**.
  - Flags block crossings $\ge \text{IDR } 5\text{B}$ or $\ge 20\%$ volume, calculating premium/discount percentages vs. regular market price (`ANOMALOUS_DISPERSION` if $> 20\%$).
- **Dynamic IDX Position Sizer & Execution Audit (`lib/risk/sizer.ts`, `lib/risk/audit.ts`)**:
  - Computes exact lot quantities adhering to IDX 5-tier Fraksi Harga brackets, buy ($0.15\%$) and sell ($0.25\%$) transaction friction.
  - Sizing constraints: maximum 20% portfolio equity cap and 2.5% ADTV liquidity ceiling. Fail-closed guard on Full Call Auction (FCA) securities.
  - Realized execution tracking: tick distance slippage, VWAP multi-tier fill calculations, and execution quality tags (`EXCELLENT_FILL`, `ACCEPTABLE_FILL`, `SUBOPTIMAL_FILL`).
- **UI Surfaces & Watchlist Controls**:
  - `BattlePlanCard` rendered at the top of `/desk` with trigger levels, $V_{15m}$ targets, and 1-click "Hitung Lot" button.
  - `PositionSizerModal` dynamic lot risk modal integrated into `/desk`.
  - Custom emiten Watchlist CRUD: 4-letter IDX symbol validation, sidebar addition form, and quick-toggle controls on `/radar`.
- **Walk-forward Evaluation Gate**:
  - CLI `npm run walkforward:lifecycle` evaluating institutional lifecycle performance with a 30-trade sample size floor.

### Unreleased / v0.11.0 (draft) — Phase 6 Hardening

Phase 6 ships process health, weekday holiday no-ops, and fail-closed Stockbit deadlines. Phase 4 remains capture-complete, not ship-complete. No gate is armed.

- **Live/ready/ops health** (`GET /api/health`): Docker `HEALTHCHECK` probes `?level=live` only through `scripts/health-probe.mjs` (`r.ok`). Ready/ops still ping Postgres, Redis, workers, and stall. Public, secret-free, never HTTP 5xx.
- **Weekday IDX holiday skip**: the daily watchlist job uses wall-clock Jakarta date, writes a job log first, and no-ops before Stockbit on weekend/holiday.
- **Fail-closed Stockbit deadline**: hung fetches abort at `STOCKBIT_TIMEOUT_MS` (default 15000) with `StockbitTimeoutError` and zero retries. 429/5xx still back off; Retry-After is capped at 30s.
- **Operator surfaces**: the job pill is watchlist-scoped, treats transport failure as “Status unavailable”, and the morning card banners IDX closures while still ranking the last session.

### Unreleased / v0.10.0 (draft) — Phase 5 Ranked Desk

Phase 5 ships the ranked desk, the morning card, and auto-filled journal
outcomes. **Phase 4 remains capture-complete, not ship-complete:**
`SHIP_GATE=VERDICT_UNREACHABLE` still stands, no gate is armed, and this
release does not validate G1, G5, or G7. The desk **reads stored
`decision_journal` rows** — it never re-evaluates Adi target math or the
playbook. The forward test now has a writer; the first scored row arrives
only after five complete forward sessions exist.

- **Ranked desk (`/desk`, `GET /api/desk`)**: stance ladder
  `ENTER > WAIT > TAKE_PROFIT > INVALIDATED > AVOID`, then finite R:R
  descending, then emiten. Null R:R renders as `—`. AVOID is
  default-hidden behind `Tampilkan AVOID`; TAKE_PROFIT stays visible.
- **Morning card**: ENTER / WAIT / AVOID / TAKE_PROFIT counts from stored
  cards, plus skipped non-IDX names (`USDIDR`).
- **Explainability**: every WAIT/AVOID shows the stored gate reason, not
  ids-only. Unexplained rows stay visible.
- **Outcome backfill**: `npm run backfill:outcomes` scores ENTER rows with
  a complete N=5 horizon via canonical `scorePath`. Unscored stays SQL
  NULL. Idempotent (`outcome IS NULL`).
- **Job repairs**: flattened `buildJournalPayload`, fail-closed capture
  guard, playbook boundary parity with `/api/stock`, IDX-only price-history
  universe.

### Unreleased / v0.9.0 (draft) — Phase 4 Macro Regime (G7)

Phase 4 adds **G7**, a macro-regime hold. **Default-off, not validated, and
currently incapable of firing.** No threshold in this release has been shown to
improve a single trade: G7 is off by default, and arming it changes nothing
today because the empirical study that defines its bounds returned
`ARMED_CLAUSES=0/3`.

**The sample reality, stated first: the correlation study ran on 2,243 macro
bars and 13 successful signals across 3 dates, and every clause fell below the
30-observation floor a bound requires.** So `npm run macro:correlation` publishes
the z-score distribution and refuses to publish a threshold, and
`npm run walkforward:p4` reports `VERDICT_UNREACHABLE` — the gate is not
adjudicable, not failed. Treat G7 as instrumentation collecting evidence, not as
a feature that works.

- **Correlation first (`scripts/run-macro-correlation.ts`)**: a clause may not
  have a bound until an empirical study shows an adverse macro reading is
  followed by worse forward returns, on at least 30 observations. The study ran
  and armed nothing. That is the design working, not the feature failing.
- **The classifier is pure** (`lib/macro/classifier.ts`): trailing z-score
  against a strictly-prior 20-session window, no clock, no database, no
  network. A bar may not appear in its own baseline.
- **Unarmed means it cannot fire.** Bounds are `null` until measured, so a
  half-measured phase reports `NOT_EVALUATED` rather than inventing a number
  that would look rigorous and mean nothing.
- **G7 is a single-notch hold, never a veto.** It can only turn `ENTER` into
  `WAIT`. It never creates an `ENTER`, never softens a `WAIT`, and never
  reaches `AVOID` — a hostile backdrop is not a broken thesis. The armed branch
  is the last `else if` in the stance ladder, which is what makes that
  structural rather than aspirational, and `scripts/check-g7-single-notch.mjs`
  fails the build if that ordering changes.
- **Fails open**, like G5 and unlike G4. A vendor outage or a missing snapshot
  is an absence of evidence; failing closed on it would delete valid trades
  every time the upstream had a bad day.
- **Point-in-time everywhere.** Live reads use `bar_date <= asOf`; the replay
  drops a forward-dated bar rather than clamping it. Clamping would be exactly
  the lookahead this layer exists to prevent.
- **USD/IDR is a JISDOR proxy, not JISDOR.** The feed is Stockbit's market spot
  rate for US Dollar / Rupiah. Bank Indonesia's JISDOR is a volume-weighted
  interbank benchmark computed at end of day and published under no ticker on
  this feed. The series is named `USDIDR` everywhere and no claim depends on
  the two being equal.
- **Profiles** — `PLAYBOOK_G7_PROFILE` is `off` (default, G7 inert), `visible`
  (reports a CAUTION without touching the stance), `veto` (armed; a CAUTION
  downgrades `ENTER` to `WAIT`). An unrecognised value degrades to `off`.
- **Capture is isolated**: `lib/jobs/macro-capture.ts` runs once per daily
  session, before and outside the per-emiten loop. A failure marks
  `macro_incomplete` and never aborts an emiten.
- **Migrations 026/027**: `macro_snapshot` stores raw bars and no computed
  verdict, so a future recalibration re-scores history without a backfill.
  `stock_queries.macro_incomplete` is independent of the two existing
  incomplete flags.

### Unreleased / v0.8.0 (draft) — Phase 3 Fundamental Veto (G5)

Phase 3 adds **G5**, a fundamental health veto. **Default-off, and not
validated.** No fundamental rule in this release has been shown to improve a
single trade: G5 is off by default, and turning it on does not make the desk
better — it makes a specific, testable claim that is still waiting on data.

**The sample reality, stated first: the first ~14 months of `stock_queries`
rows have no fundamental columns, and the OOS signal sample Phase 3 needs is
still growing from zero.** A ship verdict cannot be reached yet, so
`npm run walkforward:p3` reports `VERDICT_UNREACHABLE` — the gate is not
adjudicable, not failed. Treat G5 as instrumentation that is quietly collecting
evidence, not as a feature that works.

- **Rubric (`lib/fundamentals/rubric.ts`)**: three frozen clauses —
  `NEGATIVE_EQUITY` (total equity < 0), `EXTREME_LEVERAGE` (liabilities/equity
  > 5.0, non-financials only), `DISTRESS_SCORE` (modified Altman Z < 0, or
  Z < 1.1 with negative operating cash flow). Pure: no clock, no env, no I/O.
- **Financial issuers are excluded, by positive evidence.** If a
  bank-exclusive regulatory metric is present (NPL, capital adequacy, loan to
  deposit, NIM), the non-bank solvency tests are bypassed. This is not
  cosmetic. Half the live watchlist is major banks whose liabilities/equity runs
  5.14 to 13.52 and is perfectly healthy; a naive leverage veto would discard
  5 of 10 emitens and collapse the sample by half before a single trade was
  scored. Calibrated against 26 live payloads: 2 real landmines caught
  (`POLY` equity −18,252 B, Altman −183.50; `TBIG` Altman −1.14), no false
  positives.
- **G5 is monotone**: it can only turn `ENTER` into `AVOID`. It can never
  create an entry, soften a `WAIT`, or override an earlier gate. Missing data
  fails **open** to `NOT_EVALUATED` — a fundamentals outage must never block an
  otherwise valid technical setup.
- **Profiles** — `PLAYBOOK_G5_PROFILE` is `off` (default, G5 inert), `visible`
  (score shown, never vetoes) or `veto` (armed). Read at the route boundary;
  the evaluator stays pure and reads no environment.
- **Capture**: one KeyStats fetch per emiten per session, inside the existing
  4/s limiter, with no extra market-detector calls. A failure writes
  `fundamentals_incomplete` — separate from Phase 2's `capture_incomplete`,
  because the two captures fail independently.
- **Point-in-time**: the feed is a current snapshot with no fiscal period and
  no publication date, so the capture date is the only thing that makes a
  reading knowable at decision time. Replay reads the persisted snapshot and
  never re-fetches; a snapshot dated after its signal is rejected as lookahead.

### Unreleased / v0.8.0 (draft) — Phase 2 Persistence & Micro

Phase 2 "Persistence & Micro" — akumulasi/distribusi, persistensi bandar
berulang, dan aliran broker tunggal sebagai pendalaman G1. **Default-off.**

- **Substrat capture (`lib/micro/`)**: kontrak acc/dist tertutup 6-state
  (`parseAccDist`, tanpa substring matching sehingga perubahan kosakata vendor
  tidak diam-diam mengarahkan gate), tier persistensi (`spike` / `building` /
  `persistent`, jendela 3 print), dan `flowState` 5-sesi
  (`flowWindow=5`, `consistencyPct>=60`, `activeDays>=3`).
- **Mikro pada kartu**: G1 di bawah profil `phase-2` menolak `DIST` sebagai
  `AVOID`, menunda `spike` (perlu konfirmasi hari kedua) dan flow `bad`,
  semuanya **setelah** cek kategori broker — jadi broker ritel ditolak lebih
  dulu, bukan setelah data mikro dibaca.
- **Nol panggilan HTTP tambahan**: job watchlist harian memakai ulang respons
  `marketdetectors` yang sudah diambil; hanya satu panggilan flow untuk
  akumulator teratas. Limiter 4/detik tidak tersentuh.
- **Perbaikan tangkapan (D18)**: fetch gagal (429/timeout) menandai
  `capture_incomplete = true` alih-alih menulis `null` senyap;
  `scripts/repair-captures.ts` melengkapi data mikro tanpa mengubah harga
  maupun stance. Baris yang rusak tetap unscored sampai diperbaiki.
- **Jurnal & UI**: `DecisionCard` menampilkan blok "Persistensi &
  Micro" (badge Akumulasi / Streak / Aliran broker); payload jurnal G1
  menyertakan snapshot mikro.
- **Ship gate 7 kondisi** + `VERDICT_UNREACHABLE`: ONS minimum 30 Phase 2
  dan 50 Phase 1 (dipaksa oleh rasio no-collapse 0.60), membutuhkan ~300
  tanggal unik (±14 bulan) sebelum gate bisa dihakimi. `VERDICT_UNREACHABLE`
  — bukan `FAIL` — dicetak selama periode itu, supaya kegagalan sample
  tidak dilatih untuk diabaikan.

### Unreleased / v0.7.0 (draft) — Phase 1 Tape Filter

Phase 1 "Tape Filter" — ATR(14) invalidation, 20-EMA trend gate, and the
3-pattern allow-list, validated by a purged walk-forward before the gate ships.

- **Tape substrate (`lib/tape/`)**: zero-dependency Wilder ATR(14) and
  TA-Lib-aligned EMA(20) with lookahead-closed snapshot builder
  (`MIN_BARS = 21`, unclosed session excluded when `liveIncompleteToday`).
- **3-pattern allow-list**: P1 Wyckoff spring, P2 higher low with same-bandar
  persistence, P3 break of prior high holding above EMA(20). No candlestick
  patterns.
- **G3 ATR invalidation**: stop = `rataRataBandar − 1.0×ATR` tick-rounded
  toward entry on IDX fraksi; Phase 0 interim `min(arb, bandar×0.97)` kept as
  the no-tape fallback.
- **G4 live fail-closed tape gate**: missing/short tape or a collapsing tape
  without an allow-list pattern → `WAIT`; G5–G7 remain skipped (`phase-1`).
- **Unified path-outcome scorer**: stop-first, max-before-R1, expiry at last
  close, round-trip friction 0.006, empty path unscored.
- **365-day chunked backfill**: Stockbit history queries paginated through
  `chunkDateRange` and deduplicated (`dedupeHistoryByDate`).
- **Walk-forward reporter**: `npm run walkforward:g4` compares the Phase 0
  card (G0–G3, interim stop, G4 skipped) against the Phase 1 card (G0–G4, ATR
  stop) on a purged 80/20 split (5-session purge gap). Ship gate = Phase 1
  beats Phase 0 on OOS expectancy and profit factor with ≥ 30 ENTER trades.

### Unreleased / v0.6.0 (draft)

Phase 0 "Honest Desk" — deterministic decision engine built on the Adi Sucipto
target math. This entry describes work merged locally; **the CI workflow file was
added but a GitHub CI run is not claimed in this entry.**

- **Decision Journal JSONB Fix**: `saveDecisionJournal` serializes the `gates`
  array into valid JSON before reaching node-postgres (was: `invalid input syntax
  for type json` on every journal POST). `strategi_trading` is also covered by
  the same serializer, and `listDecisionJournal(emiten, limit)` now reads back
  the latest cards ordered by `as_of DESC`.
- **Canonical G0–G3 Playbook Evaluator**: `lib/playbook/evaluate.ts` implements
  the spec exactly — G0 data integrity (degenerate book → `AVOID`), G1 bandar
  sponsorship (Smartmoney/Whale accumulation; `TAKE_PROFIT` when `harga > R1`
  with an open ENTER card), G2 execution headroom (`harga >= ara`,
  `totalOffer > 2 × totalBid`), and G3 net risk-reward ≥ 1.5 after IDX friction.
  The invented 5%-above-bandar chase rule is removed. G4–G7 are emitted as
  `pass: true, skipped: true` for forward compatibility (Phase 1 replaces G4
  with the live tape filter).
- **Live Context Wiring**: `/api/stock` now builds the playbook input from
  historical bandar accumulation (prior 3 sessions), token validity
  (`getTokenStatus`), IDX session check (`market-calendar`), and the latest
  journaled card for open-position detection. The Decision Card renders the
  evaluator's output and the calculator journals every shown card.
- **Price History Backfill Worker**: BullMQ queue `price-history-backfill`
  (`concurrency: 1`) with `enqueuePriceHistoryBackfill()` and a session-gated
  `POST /api/price-history/backfill`. The CLI `npm run backfill:history` remains
  as an operator fallback. No daily cron in Phase 0.
- **2026 IDX Holiday Seed (from SKB 3 Menteri 2026)**: `lib/idx-holidays.json`
  now carries 13 weekday libur-nasional dates. Sourced from the
  `api.kemendesa.link` national-holiday API (metadata cites SKB 3 Menteri 2026)
  and cross-checked against the `guangrei/APIHariLibur_V2` dataset. Cuti-bersama
  days are excluded because the exchange stays open on them. See
  `docs/R5-IDX-HOLIDAYS-BLOCKER.md` for the derivation and the caveat that the
  gazette PDF itself is a scanned image.
- **Story Analysis Schema Alignment**: `buildPrompt` is now exported and requires
  `strategi_trading` (`tipe_saham`, `catalyst_bias`, `invalidating_events`) in
  the model output while continuing to forbid numeric price levels.
  `updateAgentStory` persists `strategi_trading` to the JSONB column, and
  `AgentStoryCard` shows it with a fixed disclaimer that targets and
  invalidations follow the Decision Card (Adi R1/Max).
- **Phase 0 Hardening (from the audited initial delivery)**: test harness
  expansion, guarded `calculateTargets` math, Asia/Jakarta market calendar,
  `AUTH_SECRET` required in production, scrypt password hashing with legacy
  migration, allow-listed profile settings, Stockbit JWT redaction, Stockbit
  token-bucket rate limiter, `price_history` table, unified hit definition
  (next-day `max_harga`), Adi-only baseline harness, decision journal table and
  API, and the Decision Card UI.

### v0.5.0 (2026-09-24)
- **Self-Hosted Migration**: Netlify + Supabase → Next.js standalone + PostgreSQL 16 + Redis 7 (BullMQ) dalam Docker Compose.
- **Native pg Data Layer**: `lib/db.ts` menggantikan PostgREST/Supabase client; `lib/supabase.ts` tetap sebagai shim backward-compatible.
- **Embedded Workers**: Background job (watchlist & story analysis) berjalan di proses Next.js via `instrumentation.ts`.
- **OpenAI-Compatible LLM**: `LLM_PROVIDER=openai` mendukung endpoint chat-compatible (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`).
- **Fix JSONB Persistence**: `updateAgentStory` men-serialize nilai array/object untuk kolom `jsonb` (mencegah `invalid input syntax for type json`).
- **Chrome Extension Dist**: `stockbit-token-extension/dist/` siap load + archive `.zip`.

### v0.4.0 (2026-02-23)
- **High-Fidelity Copy Image**: Migrasi dari `html2canvas` ke `html-to-image` untuk hasil capture yang lebih tajam (HD) dan akurat.
- **Transparent Corners**: Optimalisasi capture spesifik pada elemen card untuk menghasilkan pojok yang transparan (rounded).
- **Clean Capture**: Penambahan fitur filter otomatis untuk menyembunyikan tombol aksi footer dari hasil gambar copy.

### v0.3.3 (2026-02-22)
- **Password Protection**: Implementasi keamanan akses aplikasi dengan proteksi password.
- **Session-based Unlocking**: Mekanisme akses satu kali per sesi.
- **Reset Documentation**: Panduan pemulihan akses melalui Supabase jika lupa password.

### v0.3.2 (2026-02-22)
- **Local Watchlist & Normalization**: Mengalihkan penyimpanan data watchlist dari Stockbit API ke database lokal (cache-first) dengan struktur database yang lebih efisien.
- **Status Indicator UI**: Pembaruan indikator status token dengan warna **Orange** untuk status "Expiring", serta pemindahan indikator proses fetching stockbit ke Navbar untuk mencegah *layout shifting*.
- **Spinner & Aesthetics**: Pembaruan gaya visual spinner menjadi transparan (arc-only) dan penyatuan status sinkronisasi *Watchlist* ke indikator global di Navbar.
- **Documentation Migration**: Memindahkan panduan instalasi lengkap ke Wiki (`docs/WIKI_DEPLOY_LOCAL.md` & `docs/WIKI_DEPLOY_CLOUD.md`) untuk menjaga agar README tetap ringkas.

### v0.3.1 (2026-02-19)
- **Responsive Navbar**: Implementasi menu hamburger untuk tampilan mobile, memindahkan indikator status dan toggle tema ke dalam sub-menu.
- **Card UI Fixes**: Perbaikan alignment logo/judul pada navbar dan penanganan nama sektor yang sangat panjang (elipsis) pada card ringkasan.
- **Scroll Optimization**: Menonaktifkan vertical scroll pada `CompactResultCard` dan `BrokerSummaryCard` untuk menjaga konsistensi visual saat pengambilan screenshot/copy image.

### v0.3.0 (2026-02-16)
- **New Summary & Performance Dashboard**: Dasbor khusus untuk melacak performa emiten dalam jangka waktu tertentu (3, 5, 10, 20, 50 hari trading).
- **Hit Rate Analytics**: Kalkulasi otomatis "Hit Rate R1", "Hit Rate Max", dan "Total Hit Rate" berdasarkan riwayat analisis nyata.
- **Top 3 Bandar Tracking**: Menampilkan 3 broker paling aktif untuk setiap emiten, lengkap dengan jumlah kemunculan dan klasifikasi tipe (Whale, Smart Money, Retail, Mix).
- **Fix PDF Export Global**: Perbaikan bug di mana beberapa emiten terlewati pada "All Per Emiten PDF" serta memastikan filter diterapkan secara global (bukan hanya halaman aktif).
- **UI/UX Refinements**: Standarisasi ukuran font, peningkatan kontras warna label pada Dark Mode, dan optimalisasi layout kolom untuk keterbacaan data yang lebih baik.

### v0.2.0 (2026-02-15)
- **Advanced PDF Export**: Sistem pelaporan PDF baru yang lebih informatif, mencakup:
  - Format portrait yang dioptimalkan (muat 20 baris per halaman).
  - Ringkasan statistik agregat (Hit R1, Hit Max, Avg Bandar Plus/Minus).
  - Ringkasan frekuensi Bandar per emiten.
  - Grafik performa visual (dot tracking) terintegrasi dalam PDF.
- **Revamp UI Tabel Riwayat**: Pembaruan gaya tombol "Solid-Btn" yang lebih premium dan konsisten di seluruh aplikasi, serta perbaikan visibilitas elemen pada Dark Mode.
- **Sinkronisasi Format Laporan**: Menyamakan format output antara "Filtered PDF" dan "Per Emiten PDF" untuk konsistensi data.
