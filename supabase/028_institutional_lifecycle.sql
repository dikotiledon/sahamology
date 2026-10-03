-- Migration 028: The Institutional Trading Lifecycle
-- Adds broker archetypes, multi-window absorption tracking, 08:30 WIB pre-market battle plans,
-- intraday tape alerts, and post-trade execution audits.

-- 1. Curated IDX Broker Archetypes
CREATE TABLE IF NOT EXISTS broker_archetypes (
    broker_code VARCHAR(4) PRIMARY KEY,
    broker_name VARCHAR(100) NOT NULL,
    archetype VARCHAR(30) NOT NULL CHECK (archetype IN ('foreign_institutional', 'domestic_institutional', 'retail', 'proprietary')),
    is_whale BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed broker archetypes with initial known codes
INSERT INTO broker_archetypes (broker_code, broker_name, archetype, is_whale) VALUES
    ('AK', 'UBS Sekuritas Indonesia', 'foreign_institutional', TRUE),
    ('BK', 'J.P. Morgan Sekuritas Indonesia', 'foreign_institutional', TRUE),
    ('CC', 'Mandiri Sekuritas', 'foreign_institutional', TRUE),
    ('CS', 'Credit Suisse Sekuritas Indonesia', 'foreign_institutional', TRUE),
    ('RX', 'Macquarie Sekuritas Indonesia', 'foreign_institutional', TRUE),
    ('KZ', 'CLSA Sekuritas Indonesia', 'foreign_institutional', TRUE),
    ('ZP', 'Maybank Sekuritas Indonesia', 'foreign_institutional', TRUE),
    ('CG', 'CGS-CIMB Sekuritas Indonesia', 'foreign_institutional', TRUE),
    ('OD', 'BRI Danareksa Sekuritas', 'domestic_institutional', FALSE),
    ('LG', 'Trimegah Sekuritas Indonesia', 'domestic_institutional', FALSE),
    ('NI', 'BNI Sekuritas', 'domestic_institutional', FALSE),
    ('DP', 'DBS Vickers Sekuritas Indonesia', 'domestic_institutional', FALSE),
    ('DX', 'Bahana Sekuritas', 'domestic_institutional', FALSE),
    ('TP', 'OCBC Sekuritas Indonesia', 'domestic_institutional', FALSE),
    ('YP', 'Mirae Asset Sekuritas Indonesia', 'retail', FALSE),
    ('PD', 'Indo Premier Sekuritas', 'retail', FALSE),
    ('XC', 'Ajaib Sekuritas Asia', 'retail', FALSE),
    ('KK', 'Phillip Sekuritas Indonesia', 'retail', FALSE),
    ('CP', 'KB Valbury Sekuritas', 'retail', FALSE),
    ('SQ', 'BCA Sekuritas', 'retail', FALSE),
    ('XL', 'Stockbit Sekuritas Digital', 'retail', FALSE)
ON CONFLICT (broker_code) DO UPDATE SET
    broker_name = EXCLUDED.broker_name,
    archetype = EXCLUDED.archetype,
    is_whale = EXCLUDED.is_whale,
    updated_at = NOW();

-- 2. Rolling Broker Flow & Absorption Daily
CREATE TABLE IF NOT EXISTS flow_absorption_daily (
    emiten VARCHAR(10) NOT NULL,
    trade_date DATE NOT NULL,
    window_1d_net_val NUMERIC NOT NULL DEFAULT 0,
    window_3d_net_val NUMERIC NOT NULL DEFAULT 0,
    window_5d_net_val NUMERIC NOT NULL DEFAULT 0,
    window_20d_net_val NUMERIC NOT NULL DEFAULT 0,
    top3_concentration_1d NUMERIC(5,4) NOT NULL DEFAULT 0,
    top3_concentration_5d NUMERIC(5,4) NOT NULL DEFAULT 0,
    foreign_net_val_5d NUMERIC NOT NULL DEFAULT 0,
    domestic_whale_net_val_5d NUMERIC NOT NULL DEFAULT 0,
    retail_net_val_5d NUMERIC NOT NULL DEFAULT 0,
    price_change_5d_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
    absorption_quality_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    absorption_tag VARCHAR(25) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (emiten, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_flow_absorption_date_score 
ON flow_absorption_daily (trade_date, absorption_quality_score DESC);

-- 3. Tactical 08:30 WIB Pre-Market Battle Plans
CREATE TABLE IF NOT EXISTS premarket_battle_plans (
    id BIGSERIAL PRIMARY KEY,
    plan_date DATE NOT NULL,
    emiten VARCHAR(10) NOT NULL,
    stance VARCHAR(20) NOT NULL,
    trigger_price NUMERIC NOT NULL,
    target_r1 NUMERIC NOT NULL,
    target_max NUMERIC NOT NULL,
    invalidation_price NUMERIC NOT NULL,
    open_15m_vol_threshold BIGINT NOT NULL,
    macro_bias VARCHAR(50) NOT NULL DEFAULT 'NEUTRAL',
    catalyst_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_plan_date_emiten UNIQUE (plan_date, emiten)
);

CREATE INDEX IF NOT EXISTS idx_battle_plans_date ON premarket_battle_plans (plan_date);

-- 4. Intraday Tape, Crossing, and Volatility Alerts
CREATE TABLE IF NOT EXISTS intraday_tape_alerts (
    id BIGSERIAL PRIMARY KEY,
    emiten VARCHAR(10) NOT NULL,
    alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN ('FLOW_VELOCITY_SPIKE', 'CROSSING_DETECTED', 'PRECLOSING_ANOMALY', 'UMA_APPROACH')),
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    trigger_price NUMERIC,
    evidence JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tape_alerts_created_at ON intraday_tape_alerts (created_at DESC);

-- 5. Realized Execution & Slippage Audits
CREATE TABLE IF NOT EXISTS execution_audits (
    id BIGSERIAL PRIMARY KEY,
    journal_id BIGINT REFERENCES decision_journal(id) ON DELETE CASCADE,
    emiten VARCHAR(10) NOT NULL,
    trade_date DATE NOT NULL,
    planned_entry NUMERIC NOT NULL,
    executed_entry NUMERIC NOT NULL,
    slippage_ticks INT NOT NULL,
    slippage_pct NUMERIC(6,3) NOT NULL,
    position_size_lots INT NOT NULL,
    allocated_capital NUMERIC NOT NULL,
    actual_exit_price NUMERIC,
    realized_pnl NUMERIC,
    exit_reason VARCHAR(30) CHECK (exit_reason IN ('TARGET_R1', 'TARGET_MAX', 'STOP_LOSS', 'MANUAL_EXIT', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_audits_journal ON execution_audits (journal_id);
