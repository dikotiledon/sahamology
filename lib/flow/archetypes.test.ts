import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBrokerArchetype } from './archetypes';

test('classifyBrokerArchetype maps foreign whales accurately', () => {
  const ak = classifyBrokerArchetype('AK');
  assert.equal(ak.archetype, 'foreign_institutional');
  assert.equal(ak.isWhale, true);

  const bk = classifyBrokerArchetype('BK');
  assert.equal(bk.archetype, 'foreign_institutional');
  assert.equal(bk.isWhale, true);
});

test('classifyBrokerArchetype maps retail brokers accurately', () => {
  const yp = classifyBrokerArchetype('YP');
  assert.equal(yp.archetype, 'retail');
  assert.equal(yp.isWhale, false);

  const pd = classifyBrokerArchetype('PD');
  assert.equal(pd.archetype, 'retail');
  assert.equal(pd.isWhale, false);
});

test('classifyBrokerArchetype handles unknown or lowercase codes gracefully', () => {
  const unknown = classifyBrokerArchetype('ZZ');
  assert.equal(unknown.archetype, 'unclassified');
  assert.equal(unknown.isWhale, false);

  const lower = classifyBrokerArchetype('ak');
  assert.equal(lower.archetype, 'foreign_institutional');
  assert.equal(lower.isWhale, true);
});
