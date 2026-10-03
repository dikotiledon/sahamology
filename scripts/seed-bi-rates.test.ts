import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORICAL_BI_DECISIONS } from './seed-bi-rates';

test('HISTORICAL_BI_DECISIONS contains structured RDG records with valid rate constraints', () => {
  assert.equal(HISTORICAL_BI_DECISIONS.length >= 10, true);
  for (const item of HISTORICAL_BI_DECISIONS) {
    assert.match(item.meeting_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof item.rate, 'number');
    assert.equal(item.rate >= 4.0 && item.rate <= 10.0, true);
    assert.equal(['HOLD', 'HIKE', 'CUT'].includes(item.action), true);
    assert.equal(typeof item.governor_statement, 'string');
    assert.equal(item.governor_statement.length > 10, true);
  }
});
