import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPublicProfileKey, FORBIDDEN_PROFILE_KEYS } from './profile-keys';

test('history_row_count is a public profile key', () => {
  assert.equal(isPublicProfileKey('history_row_count'), true);
});

test('password keys are never public', () => {
  for (const key of FORBIDDEN_PROFILE_KEYS) {
    assert.equal(isPublicProfileKey(key), false);
  }
});

test('unknown keys are rejected', () => {
  assert.equal(isPublicProfileKey('password_hash'), false);
  assert.equal(isPublicProfileKey('anything_else'), false);
});
