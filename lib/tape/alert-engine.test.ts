import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTapeAlerts, TapeSnapshot } from './alert-engine';

test('detects CROSSING_DETECTED with premium/discount calculation when nego value >= 5B IDR', () => {
  const snapshot: TapeSnapshot = {
    emiten: 'BUMI',
    regularPrice: 150,
    regularVolume: 10_000_000,
    negoVolume: 50_000_000,
    negoPrice: 135, // 10% discount
    negoValue: 6_750_000_000,
    netForeignFlowRate: 1_000_000,
  };
  const alerts = evaluateTapeAlerts(snapshot);
  const crossing = alerts.find(a => a.alertType === 'CROSSING_DETECTED');
  assert.ok(crossing, 'Expected CROSSING_DETECTED alert');
  assert.equal(crossing.evidence.discountPct, 10.0);
  assert.equal(crossing.severity, 'WARNING');
});

test('detects FLOW_VELOCITY_SPIKE on aggregate foreign flow acceleration without individual broker codes', () => {
  const snapshot: TapeSnapshot = {
    emiten: 'ASII',
    regularPrice: 5000,
    regularVolume: 5_000_000,
    negoVolume: 0,
    negoPrice: 0,
    negoValue: 0,
    netForeignFlowRate: 4_500_000_000, // surge
    avgOpeningFlowRate: 1_000_000_000, // 4.5x rate
  };
  const alerts = evaluateTapeAlerts(snapshot);
  const velocity = alerts.find(a => a.alertType === 'FLOW_VELOCITY_SPIKE');
  assert.ok(velocity, 'Expected FLOW_VELOCITY_SPIKE alert');
  assert.equal(velocity.severity, 'CRITICAL');
});

test('detects PRECLOSING_ANOMALY when indicative price deviates by more than 3 percent', () => {
  const snapshot: TapeSnapshot = {
    emiten: 'TLKM',
    regularPrice: 3000,
    regularVolume: 20_000_000,
    negoVolume: 0,
    negoPrice: 0,
    negoValue: 0,
    isPreClosingWindow: true,
    indicativeClosingPrice: 3120, // +4% shift
  };
  const alerts = evaluateTapeAlerts(snapshot);
  const anomaly = alerts.find(a => a.alertType === 'PRECLOSING_ANOMALY');
  assert.ok(anomaly, 'Expected PRECLOSING_ANOMALY alert');
  assert.equal(anomaly.evidence.priceShiftPct, 4.0);
});
