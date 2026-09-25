export const PUBLIC_PROFILE_KEYS = ['history_row_count'] as const;

export const FORBIDDEN_PROFILE_KEYS = ['password_hash', 'password_enabled'] as const;

export function isPublicProfileKey(key: string): boolean {
  return (PUBLIC_PROFILE_KEYS as readonly string[]).includes(key);
}

export function isForbiddenProfileKey(key: string): boolean {
  return (FORBIDDEN_PROFILE_KEYS as readonly string[]).includes(key);
}
