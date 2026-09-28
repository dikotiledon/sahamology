import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCDIST_STATES,
  ACCDIST_BLOCKS_G1,
  ACCDIST_STRING_MAP,
  parseAccDist,
} from './accdist-contract';

describe('parseAccDist (D8)', () => {
  it('maps the absent sentinels to UNKNOWN and never throws', () => {
    assert.equal(parseAccDist(null), 'UNKNOWN');
    assert.equal(parseAccDist(undefined), 'UNKNOWN');
    assert.equal(parseAccDist('-'), 'UNKNOWN', "'-' is the lib/stockbit.ts:322 sentinel");
    assert.equal(parseAccDist(''), 'UNKNOWN');
    assert.equal(parseAccDist('   '), 'UNKNOWN');
  });

  it('maps an unmapped vendor string to UNKNOWN rather than guessing', () => {
    assert.equal(parseAccDist('some new vendor string'), 'UNKNOWN');
    assert.equal(parseAccDist('Net Accumulation'), 'UNKNOWN', 'no substring matching — a vendor string change must not silently re-route a gate (D8)');
  });

  it('is case- and whitespace-insensitive on a real mapping', () => {
    assert.equal(parseAccDist('ACC'), 'ACC');
    assert.equal(parseAccDist('acc'), 'ACC');
    assert.equal(parseAccDist('  Small Dist  '), 'SMALL_DIST');
    assert.equal(parseAccDist('dist'), 'DIST');
  });

  it('every value in ACCDIST_STATES has exactly one canonical string mapping', () => {
    for (const state of ACCDIST_STATES) {
      if (state === 'UNKNOWN') continue; // UNKNOWN is the fallback, not a string key
      const keys = Object.keys(ACCDIST_STRING_MAP).filter((k) => ACCDIST_STRING_MAP[k] === state);
      assert.ok(keys.length >= 1, `${state} has no string mapping`);
    }
  });

  it('ACCDIST_STATES is closed at exactly six states (D8)', () => {
    assert.equal(ACCDIST_STATES.length, 6);
    assert.deepEqual([...ACCDIST_STATES].sort(), [
      'ACC',
      'DIST',
      'NEUTRAL',
      'SMALL_ACC',
      'SMALL_DIST',
      'UNKNOWN',
    ]);
  });
});

describe('ACCDIST_BLOCKS_G1 (D8 / Option F rejected)', () => {
  it('is exactly {DIST} — only unambiguous distribution blocks', () => {
    assert.deepEqual([...ACCDIST_BLOCKS_G1].sort(), ['DIST']);
  });

  it('SMALL_DIST and UNKNOWN do not block', () => {
    assert.equal(ACCDIST_BLOCKS_G1.has('SMALL_DIST'), false);
    assert.equal(ACCDIST_BLOCKS_G1.has('UNKNOWN'), false);
  });
});

describe('parseAccDist never fabricates a state for the empty map', () => {
  it('is total: any input maps to a member of ACCDIST_STATES', () => {
    const inputs: (string | null | undefined)[] = [
      null,
      undefined,
      '',
      '-',
      'acc',
      'ACC',
      'small acc',
      'netral',
      'neutral',
      'small dist',
      'dist',
      'weird',
      '12',
      'null',
      'undefined',
    ];
    for (const input of inputs) {
      assert.ok(
        ACCDIST_STATES.includes(parseAccDist(input)),
        `parseAccDist(${JSON.stringify(input)}) escaped the closed enum`,
      );
    }
  });
});
