export interface PublicTokenStatus {
  exists: boolean;
  isValid: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  updatedAt?: string;
  isExpiringSoon: boolean;
  isExpired: boolean;
  hoursUntilExpiry?: number;
}

interface TokenStatusRow extends PublicTokenStatus {
  token?: string;
}

/**
 * Strip the secret token from the row before anything leaves the server.
 * The UI needs connectivity flags and timestamps, never the JWT itself.
 */
export function toPublicTokenStatus(row: TokenStatusRow): PublicTokenStatus {
  const { token: _token, ...rest } = row;
  return rest;
}
