-- Migration 030: Wyckoff Structural Screener & Accumulation Phase Registry
-- Pure quantitative structural tracking: ranges, VSA events, and phase assessments.

CREATE TABLE IF NOT EXISTS wyckoff_trading_ranges (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  ice_support_price NUMERIC(12, 2) NOT NULL,
  creek_resistance_price NUMERIC(12, 2) NOT NULL,
  range_width_pct NUMERIC(6, 2) NOT NULL,
  range_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' 
    CHECK (range_status IN ('ACTIVE', 'BROKEN_OUT_UP', 'BROKEN_OUT_DOWN', 'INVALIDATED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wyckoff_range UNIQUE (emiten, start_date)
);

CREATE TABLE IF NOT EXISTS wyckoff_structural_events (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  event_type VARCHAR(30) NOT NULL 
    CHECK (event_type IN ('SELLING_CLIMAX', 'AUTOMATIC_RALLY', 'SECONDARY_TEST', 'SPRING', 'SIGN_OF_STRENGTH', 'LAST_POINT_OF_SUPPORT', 'UPTHRUST', 'UTAD')),
  price NUMERIC(12, 2) NOT NULL,
  relative_volume NUMERIC(6, 2) NOT NULL,
  relative_spread NUMERIC(6, 2) NOT NULL,
  close_position NUMERIC(4, 2) NOT NULL,
  aqs_score INT,
  event_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wyckoff_event UNIQUE (emiten, trade_date, event_type)
);

CREATE TABLE IF NOT EXISTS wyckoff_daily_assessments (
  id BIGSERIAL PRIMARY KEY,
  emiten VARCHAR(10) NOT NULL,
  trade_date DATE NOT NULL,
  current_phase VARCHAR(30) NOT NULL 
    CHECK (current_phase IN ('PHASE_A_STOPPING', 'PHASE_B_ABSORPTION', 'PHASE_C_SPRING', 'PHASE_D_TRANSITION', 'PHASE_E_MARKUP', 'PHASE_DISTRIBUTION', 'WYCKOFF_UNCLASSIFIED')),
  confidence_score INT NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  ice_level NUMERIC(12, 2),
  creek_level NUMERIC(12, 2),
  last_event VARCHAR(30),
  spring_low NUMERIC(12, 2),
  markup_readiness_score INT CHECK (markup_readiness_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wyckoff_daily UNIQUE (emiten, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_wyckoff_daily_phase ON wyckoff_daily_assessments(trade_date, current_phase);
CREATE INDEX IF NOT EXISTS idx_wyckoff_events_emiten ON wyckoff_structural_events(emiten, trade_date);
