import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toPublicTokenStatus } from './token-status';

test('public token status never includes the token value', () => {
  const out = toPublicTokenStatus({
    exists: true,
    isValid: true,
    token: 'eyJ-secret-jwt-value',
    expiresAt: '2026-09-25T12:00:00.000Z',
    lastUsedAt: '2026-09-25T11:00:00.000Z',
    updatedAt: '2026-09-25T11:00:00.000Z',
    isExpiringSoon: false,
    isExpired: false,
    hoursUntilExpiry: 1.5,
  });
  assert.equal(Object.hasOwn(out, 'token'), false);
  assert.equal(JSON.stringify(out).includes('eyJ-secret-jwt-value'), false);
});

test('missing token stays absent', () => {
  const out = toPublicTokenStatus({
    exists: false,
    isValid: false,
    isExpiringSoon: false,
    isExpired: true,
  });
  assert.equal(out.exists, false);
  assert.equal(Object.hasOwn(out, 'token'), false);
});
