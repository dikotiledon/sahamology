import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveAuthSecret, WEAK_SECRETS } from './auth-secret';

function env(nodeEnv: 'development' | 'production' | 'test', secret: string): NodeJS.ProcessEnv {
  return { NODE_ENV: nodeEnv, AUTH_SECRET: secret };
}

test('production with strong secret returns it', () => {
  assert.equal(resolveAuthSecret(env('production', 'strong-secret-32-chars-minimum!')), 'strong-secret-32-chars-minimum!');
});

test('production with missing secret throws', () => {
  assert.throws(
    () => resolveAuthSecret(env('production', '')),
    /AUTH_SECRET is required/
  );
});

test('production with every known weak secret throws', () => {
  for (const weak of WEAK_SECRETS) {
    assert.throws(
      () => resolveAuthSecret(env('production', weak)),
      /AUTH_SECRET is weak/
    );
  }
});

test('development without secret falls back to the dev literal', () => {
  assert.equal(resolveAuthSecret(env('development', '')), 'dev_secret_please_change_in_production');
});
