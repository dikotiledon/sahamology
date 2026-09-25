export const WEAK_SECRETS: readonly string[] = [
  'dev_secret_please_change_in_production',
  'please-change-me',
  'dev-secret',
  'change-me-to-a-long-random-string',
  'change-me',
];

/**
 * Resolve the HMAC session secret from the environment.
 *
 * Production fails fast on a missing or well-known weak secret so the session
 * wall cannot silently fall back to a string anyone reading the repo knows.
 * Development keeps a fixed fallback because there is no attacker model on a
 * localhost session, but only when AUTH_SECRET is genuinely unset.
 */
export function resolveAuthSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.AUTH_SECRET?.trim();
  const isProduction = env.NODE_ENV === 'production';

  if (!secret) {
    if (isProduction) {
      throw new Error('AUTH_SECRET is required in production');
    }
    return 'dev_secret_please_change_in_production';
  }

  if (isProduction && WEAK_SECRETS.includes(secret)) {
    throw new Error('AUTH_SECRET is weak: use a long random value');
  }

  return secret;
}
