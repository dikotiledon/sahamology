import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applyRadarRiskFilter } from './filter';
import type { RadarAssessment } from './types';
import type { PlaybookCard } from '../playbook/types';

describe('Zero-Stance Boundary Enforcement (Brief §2 Non-Goals)', () => {
  const dummyRadarAccumulation: RadarAssessment = {
    emiten: 'BBCA',
    asOf: '2026-10-02',
    score: 95,
    verdict: 'STRONG_ACCUMULATION',
    concentration: {
      top1NetValueRatio: 0.5,
      top3NetValueRatio: 0.85,
      retailDispersionIndex: 0.04,
      sellerCount: 25,
      buyerPriceClusteringPct: 0.01,
      isExtremeConcentration: true,
    },
    segmentation: {
      foreignNetValue: 50_000_000,
      boutiqueNetValue: 10_000_000,
      domesticInstNetValue: 5_000_000,
      retailNetValue: -60_000_000,
      institutionToRetailAbsorptionRatio: 1.08,
      predominantBuyerTier: 'FOREIGN_CUSTODIAN',
      predominantSellerTier: 'RETAIL',
      isInstitutionalAbsorption: true,
    },
    ngCrossing: {
      ngVolume: 10000,
      ngValue: 10_000_000_000,
      hasSignificantCrossing: true,
      crossingBrokers: ['AK'],
      rgFollowThroughScore: 0.8,
    },
    volumeAnomaly: {
      currentVolume: 4_000_000,
      volumeSma50: 1_000_000,
      volumeRatioToSma50: 4.0,
      priceVolatilityRatio: 0.5,
      isSilentAccumulation: true,
    },
    rolling10dScore: 85,
    rolling20dScore: 80,
    rolling60dScore: 75,
    topBuyers: [{ code: 'AK', netValue: 50_000_000, avgPrice: 1000, tier: 'FOREIGN_CUSTODIAN' }],
    topSellers: [{ code: 'YP', netValue: -30_000_000, avgPrice: 1000, tier: 'RETAIL' }],
    evidence: ['Extreme concentration: Top 3 buyers absorbed 85% of net turnover'],
  };

  const dummyRadarDistribution: RadarAssessment = {
    ...dummyRadarAccumulation,
    score: 15,
    verdict: 'HEAVY_DISTRIBUTION',
  };

  it('proves RadarAssessment cannot masquerade as PlaybookCard stance', () => {
    // Compile-time and runtime check: RadarAssessment has 'verdict', NOT 'stance'
    assert.equal('verdict' in dummyRadarAccumulation, true);
    assert.equal('stance' in dummyRadarAccumulation, false);
  });

  it('proves radar CANNOT upgrade WAIT to ENTER even with score 95 STRONG_ACCUMULATION', () => {
    const waitCard: PlaybookCard = {
      stance: 'WAIT',
      gates: [
        { id: 'G0', pass: true, reason: 'ok' },
        { id: 'G1', pass: false, reason: 'Bandar baru satu print' },
        { id: 'G2', pass: true, reason: 'ok' },
        { id: 'G3', pass: true, reason: 'ok' },
        { id: 'G4', pass: true, reason: 'ok' },
      ],
      entry: 1000,
      r1: 1100,
      max: 1200,
      invalidation: 950,
      rr: 2.0,
      thesis: 'WAIT due to G1',
      failedGates: ['G1'],
    };

    const filtered = applyRadarRiskFilter(waitCard, dummyRadarAccumulation);
    assert.equal(filtered.stance, 'WAIT');
    assert.notEqual(filtered.stance, 'ENTER');
  });

  it('proves radar CANNOT upgrade AVOID to ENTER', () => {
    const avoidCard: PlaybookCard = {
      stance: 'AVOID',
      gates: [
        { id: 'G0', pass: true, reason: 'ok' },
        { id: 'G1', pass: false, reason: 'Akumulator teratas berkategori Retail' },
      ],
      entry: null,
      r1: null,
      max: null,
      invalidation: null,
      rr: null,
      thesis: 'AVOID due to Retail bandar',
      failedGates: ['G1'],
    };

    const filtered = applyRadarRiskFilter(avoidCard, dummyRadarAccumulation);
    assert.equal(filtered.stance, 'AVOID');
    assert.notEqual(filtered.stance, 'ENTER');
  });

  it('proves radar can only DOWNGRADE ENTER -> WAIT when HEAVY_DISTRIBUTION is detected', () => {
    const enterCard: PlaybookCard = {
      stance: 'ENTER',
      gates: [
        { id: 'G0', pass: true, reason: 'ok' },
        { id: 'G1', pass: true, reason: 'ok' },
        { id: 'G2', pass: true, reason: 'ok' },
        { id: 'G3', pass: true, reason: 'ok' },
        { id: 'G4', pass: true, reason: 'ok' },
      ],
      entry: 1000,
      r1: 1100,
      max: 1200,
      invalidation: 950,
      rr: 2.0,
      thesis: 'Valid Adi setup',
      failedGates: [],
    };

    const downgraded = applyRadarRiskFilter(enterCard, dummyRadarDistribution);
    assert.equal(downgraded.stance, 'WAIT');
    assert.ok(downgraded.thesis.includes('Radar veto: Distribusi berat'));
  });

  it('preserves ENTER unchanged when radar is STRONG_ACCUMULATION', () => {
    const enterCard: PlaybookCard = {
      stance: 'ENTER',
      gates: [
        { id: 'G0', pass: true, reason: 'ok' },
        { id: 'G1', pass: true, reason: 'ok' },
        { id: 'G2', pass: true, reason: 'ok' },
        { id: 'G3', pass: true, reason: 'ok' },
        { id: 'G4', pass: true, reason: 'ok' },
      ],
      entry: 1000,
      r1: 1100,
      max: 1200,
      invalidation: 950,
      rr: 2.0,
      thesis: 'Valid Adi setup',
      failedGates: [],
    };

    const preserved = applyRadarRiskFilter(enterCard, dummyRadarAccumulation);
    assert.equal(preserved.stance, 'ENTER');
    assert.equal(preserved.entry, 1000);
    assert.equal(preserved.rr, 2.0);
  });
});
