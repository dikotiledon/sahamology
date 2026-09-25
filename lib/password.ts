import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';

export const MIN_PASSWORD_LENGTH = 8;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function scrypt(plain: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(plain, salt, keyLength, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** `scrypt$N$r$p$<salt b64url>$<key b64url>` */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(plain, salt, KEY_LENGTH);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** Legacy unsalted SHA-256 hex, retained only to detect and upgrade old rows. */
export function legacySha256(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

export function isLegacySha256Hash(stored: string): boolean {
  return /^[0-9a-f]{64}$/.test(stored);
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verifyPassword(
  plain: string,
  stored: string
): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 6) return { ok: false, needsRehash: false };
    const [, nStr, rStr, pStr, saltB64, keyB64] = parts;
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(keyB64, 'base64url');
    const key = await new Promise<Buffer>((resolve, reject) => {
      scryptCb(plain, salt, expected.length, {
        N: Number(nStr),
        r: Number(rStr),
        p: Number(pStr),
      }, (err, derived) => (err ? reject(err) : resolve(derived)));
    });
    return { ok: safeEqual(key, expected), needsRehash: false };
  }

  if (isLegacySha256Hash(stored)) {
    return { ok: legacySha256(plain) === stored, needsRehash: true };
  }

  return { ok: false, needsRehash: false };
}
