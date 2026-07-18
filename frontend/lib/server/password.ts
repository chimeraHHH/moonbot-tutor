import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(
  password: string,
  salt: string,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export const DUMMY_PASSWORD_HASH =
  'scrypt$16384$8$1$dummy-auth-timing-salt$OjJMjRNrYMFlMOlWt4OqehkpJEBpIuW9oAhSZV6eQN8KYlMO_wa1A0UNzIBrLyzMlDAOU_5JZHnWE7OduHLzmQ';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derived = await deriveKey(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEMORY,
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, nRaw, rRaw, pRaw, salt, keyRaw] = storedHash.split('$');
  if (scheme !== 'scrypt' || !nRaw || !rRaw || !pRaw || !salt || !keyRaw) {
    return false;
  }

  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  const expected = Buffer.from(keyRaw, 'base64url');
  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    n < SCRYPT_N ||
    n > 262144 ||
    (n & (n - 1)) !== 0 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 4 ||
    expected.length !== KEY_LENGTH
  ) {
    return false;
  }

  let derived: Buffer;
  try {
    derived = await deriveKey(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: SCRYPT_MAX_MEMORY,
    });
  } catch {
    return false;
  }

  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
