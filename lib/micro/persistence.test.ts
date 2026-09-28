import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { persistenceTier, PERSISTENCE_WINDOW } from './persistence';

describe('persistenceTier (D6)', () => {
  it('the window is frozen at 3 prints (D6, matches getPriorBandarCodes)', () => {
    assert.equal(PERSISTENCE_WINDOW, 3);
  });

  it('returns null when there is no band today — G1 already blocked', () => {
    assert.equal(persistenceTier(null, ['AA', 'BB']), null);
    assert.equal(persistenceTier('', ['AA']), null);
    assert.equal(persistenceTier('   ', []), null);
  });

  it('a first print is a spike', () => {
    assert.equal(persistenceTier('BK', ['AA', 'BB']), 'spike');
    assert.equal(persistenceTier('BK', []), 'spike');
  });

  it('a second matching print is building', () => {
    assert.equal(persistenceTier('BK', ['AA', 'BK']), 'building');
  });

  it('three or more matching prints are persistent', () => {
    assert.equal(persistenceTier('BK', ['BK', 'BK']), 'persistent');
    assert.equal(persistenceTier('BK', ['BK', 'BK', 'BK']), 'persistent');
  });

  it('counts exact matches only — a different code is not the same broker', () => {
    assert.equal(persistenceTier('BK', ['XX', 'YY']), 'spike');
    // 'BKI' must not be counted as a match for 'BK'
    assert.equal(persistenceTier('BK', ['BKI', 'BKI']), 'spike');
  });

  it('an overflowing prior window still saturates at persistent, never throws', () => {
    assert.equal(persistenceTier('BK', ['BK', 'BK', 'BK', 'BK', 'BK']), 'persistent');
  });

  it('priorBandar of null/undefined is treated as empty, never a crash', () => {
    assert.equal(persistenceTier('BK', undefined as unknown as string[]), 'spike');
    assert.equal(persistenceTier('BK', null as unknown as string[]), 'spike');
  });
});
