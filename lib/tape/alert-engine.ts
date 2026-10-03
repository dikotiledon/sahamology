export type TapeAlertType =
  | 'FLOW_VELOCITY_SPIKE'
  | 'CROSSING_DETECTED'
  | 'PRECLOSING_ANOMALY'
  | 'UMA_APPROACH';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface TapeSnapshot {
  emiten: string;
  regularPrice: number;
  regularVolume: number;
  negoVolume: number;
  negoPrice: number;
  negoValue: number;
  netForeignFlowRate?: number;
  avgOpeningFlowRate?: number;
  isPreClosingWindow?: boolean;
  indicativeClosingPrice?: number;
  threeDayReturnPct?: number;
  tenDayVolatilityPct?: number;
}

export interface TapeAlert {
  emiten: string;
  alertType: TapeAlertType;
  severity: AlertSeverity;
  triggerPrice?: number;
  evidence: Record<string, unknown>;
}

/**
 * Evaluates tape, negotiated market, and pre-closing auction anomalies.
 * Operates strictly on compliant aggregate feeds during live trading hours.
 */
export function evaluateTapeAlerts(snapshot: TapeSnapshot): TapeAlert[] {
  const alerts: TapeAlert[] = [];
  const {
    emiten,
    regularPrice,
    regularVolume,
    negoVolume,
    negoPrice,
    negoValue,
    netForeignFlowRate = 0,
    avgOpeningFlowRate = 0,
    isPreClosingWindow = false,
    indicativeClosingPrice,
    threeDayReturnPct = 0,
    tenDayVolatilityPct = 0,
  } = snapshot;

  // 1. Pasar Nego (Crossing) Anomaly Detector
  // Trigger: Nego Value >= Rp 5 Billion OR Nego Volume >= 20% of Regular Volume
  const hasCrossingValue = negoValue >= 5_000_000_000;
  const hasCrossingRatio = regularVolume > 0 && negoVolume / regularVolume >= 0.20;

  if (hasCrossingValue || hasCrossingRatio) {
    let discountPct = 0;
    let premiumPct = 0;
    if (regularPrice > 0 && negoPrice > 0) {
      const diffPct = ((negoPrice - regularPrice) / regularPrice) * 100;
      if (diffPct < 0) {
        discountPct = Math.round(Math.abs(diffPct) * 10) / 10;
      } else {
        premiumPct = Math.round(diffPct * 10) / 10;
      }
    }

    alerts.push({
      emiten,
      alertType: 'CROSSING_DETECTED',
      severity: 'WARNING',
      triggerPrice: negoPrice > 0 ? negoPrice : regularPrice,
      evidence: {
        negoVolume,
        negoValue,
        negoPrice,
        regularPrice,
        discountPct,
        premiumPct,
        isSignificantValue: hasCrossingValue,
      },
    });
  }

  // 2. Flow Velocity Spike Detector (Aggregate Foreign Flow Rate)
  // Trigger: netForeignFlowRate >= 3x avgOpeningFlowRate and absolute rate >= Rp 1 Billion
  if (
    avgOpeningFlowRate > 0 &&
    netForeignFlowRate >= 1_000_000_000 &&
    netForeignFlowRate >= 3 * avgOpeningFlowRate
  ) {
    alerts.push({
      emiten,
      alertType: 'FLOW_VELOCITY_SPIKE',
      severity: 'CRITICAL',
      triggerPrice: regularPrice,
      evidence: {
        netForeignFlowRate,
        avgOpeningFlowRate,
        multiple: Math.round((netForeignFlowRate / avgOpeningFlowRate) * 10) / 10,
      },
    });
  }

  // 3. Pre-Closing Auction Anomaly Detector (15:50 - 16:00 WIB)
  // Trigger: indicative closing price shifts > 3% from regular last price
  if (
    isPreClosingWindow &&
    indicativeClosingPrice !== undefined &&
    indicativeClosingPrice > 0 &&
    regularPrice > 0
  ) {
    const shiftPct = Math.round((((indicativeClosingPrice - regularPrice) / regularPrice) * 100) * 10) / 10;
    if (Math.abs(shiftPct) >= 3.0) {
      alerts.push({
        emiten,
        alertType: 'PRECLOSING_ANOMALY',
        severity: 'WARNING',
        triggerPrice: indicativeClosingPrice,
        evidence: {
          regularPrice,
          indicativeClosingPrice,
          priceShiftPct: shiftPct,
        },
      });
    }
  }

  // 4. IDX UMA Risk Monitor
  // Trigger: 3-day return >= 45% or 10-day volatility >= 50%
  if (threeDayReturnPct >= 45 || tenDayVolatilityPct >= 50) {
    alerts.push({
      emiten,
      alertType: 'UMA_APPROACH',
      severity: 'WARNING',
      triggerPrice: regularPrice,
      evidence: {
        threeDayReturnPct,
        tenDayVolatilityPct,
      },
    });
  }

  return alerts;
}
