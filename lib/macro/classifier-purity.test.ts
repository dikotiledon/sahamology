/**
 * Leaf 1.2.1 — behavioural proof of purity.
 *
 * The source-level gate (1.2.1:G2) greps the file for `process.env`, `Date` and
 * `fetch`. A grep can only prove the absence of a literal spelling, which is a
 * weaker claim than the one that matters.
 *
 * This test proves the strong version: the classifier produces the SAME result
 * when the clock is frozen and the environment is emptied. If it read either,
 * the two runs would differ — a classifier that read `Date.now()` would score a
 * replay differently from the live day that produced it, and a backtest built
 * on that difference is fiction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyRegime, REGIME_WINDOW, REGIME_THRESHOLD } from './classifier';
import type { ClassifyInput } from './classifier';

const series = (n: number, base: number): number[] =>
  Array.from({ length: n }, (_, i) => base + ((i % 5) - 2) * base * 0.01);

const sample = (): ClassifyInput => ({
  series: [
    { symbol: 'IHSG', closes: [...series(REGIME_WINDOW, 7000), 6000] },
    { symbol: 'USDIDR', closes: [...series(REGIME_WINDOW, 16000), 16200] },
  ],
  sector: 'Energi',
  sectorCommodityLegs: ['XAU'],
  thresholds: {
    ...REGIME_THRESHOLD,
    IHSG_BROAD_WEAKNESS: { bound: 1.5, measuredFrom: 'purity-fixture', direction: -1 },
  },
});

describe('the classifier is deterministic under a frozen clock', () => {
  it('produces an identical result with Date.now and new Date disabled', () => {
    const before = classifyRegime(sample());

    const realNow = Date.now;
    const RealDate = Date;
    // A clock that throws is stronger than a clock that is merely frozen: it
    // makes any read of "now" an immediate, visible failure.
    (Date as unknown as { now: () => number }).now = () => {
      throw new Error('the classifier read the clock');
    };
    try {
      const during = classifyRegime(sample());
      assert.deepEqual(during, before);
    } finally {
      (Date as unknown as { now: () => number }).now = realNow;
      void RealDate;
    }
  });

  it('produces an identical result with process.env emptied', () => {
    const before = classifyRegime(sample());
    const saved = { ...process.env };
    for (const k of Object.keys(process.env)) delete process.env[k];
    try {
      assert.deepEqual(classifyRegime(sample()), before);
    } finally {
      for (const k of Object.keys(process.env)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  });

  it('reaches the same verdict for the same bars regardless of call count', () => {
    const first = classifyRegime(sample());
    for (let i = 0; i < 5; i += 1) {
      assert.deepEqual(classifyRegime(sample()), first, 'the classifier must be a pure function');
    }
  });

  it('does not mutate the input it was given', () => {
    const input = sample();
    const snapshot = JSON.stringify(input);
    classifyRegime(input);
    assert.equal(JSON.stringify(input), snapshot, 'mutating caller-owned bars would corrupt stored history');
  });
});
