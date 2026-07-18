import { createHmac, timingSafeEqual } from 'crypto';
import type { SessionClaims } from '@/lib/server/auth-types';

export const SESSION_COOKIE_NAME = 'sophos_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
export const SESSION_IDLE_TIMEOUT_SECONDS = 60 * 60 * 8;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters when auth is enabled');
  }
  return secret;
}

function signPayload(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

export function createSessionToken(claims: SessionClaims): string {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${payload}.${signPayload(payload)}`;
}

export function verifySessionToken(token: string): SessionClaims | null {
  const segments = token.split('.');
  if (segments.length !== 2 || token.length > 1024) return null;
  const [payload, signature] = segments;
  if (!payload || !signature) return null;

  const expected = signPayload(payload);
  const actualBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expected, 'base64url');
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims;
    if (!claims.sid || !/^[0-9a-f-]{36}$/i.test(claims.sid) || !claims.exp) return null;
    if (claims.exp * 1000 <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
