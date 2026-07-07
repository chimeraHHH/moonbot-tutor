import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
const KEY_LENGTH = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derived = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, nRaw, rRaw, pRaw, salt, keyRaw] = storedHash.split('$');
  if (scheme !== 'scrypt' || !nRaw || !rRaw || !pRaw || !salt || !keyRaw) {
    return false;
  }

  const expected = Buffer.from(keyRaw, 'base64url');
  const derived = scryptSync(password, salt, expected.length, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw),
  });

  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
