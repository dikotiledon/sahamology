import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hashPassword,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
  isLegacySha256Hash,
  legacySha256,
} from './password';

test('hash round-trips and verifies', async () => {
  const stored = await hashPassword('rahasia-kuat-123');
  assert.notEqual(stored, 'rahasia-kuat-123');
  const ok = await verifyPassword('rahasia-kuat-123', stored);
  assert.equal(ok.ok, true);
  assert.equal(ok.needsRehash, false);
});

test('wrong password rejects', async () => {
  const stored = await hashPassword('rahasia-kuat-123');
  const ok = await verifyPassword('salah', stored);
  assert.equal(ok.ok, false);
});

test('scrypt hash has a unique salt per call', async () => {
  const a = await hashPassword('same-password');
  const b = await hashPassword('same-password');
  assert.notEqual(a, b);
});

test('legacy hex sha256 is detected and verifies with rehash', async () => {
  const legacy = legacySha256('legacy-pass');
  assert.equal(isLegacySha256Hash(legacy), true);
  const ok = await verifyPassword('legacy-pass', legacy);
  assert.equal(ok.ok, true);
  assert.equal(ok.needsRehash, true);
});

test('minimum password length constant is 8', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
});
