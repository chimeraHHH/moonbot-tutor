import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/server/password';
import { readJsonBody, rejectCrossOriginRequest } from '@/lib/server/request-security';
import { createSessionToken, verifySessionToken } from '@/lib/server/session-token';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sessionId = '550e8400-e29b-41d4-a716-446655440000';
let previousSecret: string | undefined;

beforeEach(() => {
  previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = previousSecret;
});

describe('password security', () => {
  it('hashes passwords with a random salt and verifies without storing plaintext', async () => {
    const first = await hashPassword('correct horse battery staple');
    const second = await hashPassword('correct horse battery staple');
    expect(first).not.toBe(second);
    expect(first).not.toContain('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', first)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', first)).resolves.toBe(false);
  });

  it('rejects attacker-controlled scrypt parameters outside the safe bounds', async () => {
    const malicious = 'scrypt$1073741824$64$64$salt$AAAA';
    await expect(verifyPassword('password', malicious)).resolves.toBe(false);
  });
});

describe('session security', () => {
  it('signs only a random session id and expiry, without user identity or role', () => {
    const token = createSessionToken({ sid: sessionId, exp: Math.floor(Date.now() / 1000) + 60 });
    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    expect(payload).toEqual({ sid: sessionId, exp: expect.any(Number) });
    expect(verifySessionToken(token)).toEqual(payload);
  });

  it('rejects tampered and expired session tokens', () => {
    const token = createSessionToken({ sid: sessionId, exp: Math.floor(Date.now() / 1000) + 60 });
    expect(verifySessionToken(`${token}x`)).toBeNull();
    expect(verifySessionToken(`${token}.ignored`)).toBeNull();
    const expired = createSessionToken({ sid: sessionId, exp: Math.floor(Date.now() / 1000) - 1 });
    expect(verifySessionToken(expired)).toBeNull();
  });
});

describe('auth surface regression coverage', () => {
  it('rejects cross-origin mutations and oversized JSON bodies', async () => {
    const crossOrigin = new NextRequest('http://sophos.local/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    expect(rejectCrossOriginRequest(crossOrigin)?.status).toBe(403);

    const oversized = new NextRequest('http://sophos.local/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ value: 'x'.repeat(128) }),
    });
    const result = await readJsonBody(oversized, 32);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it('requires phone/email, nickname, password and confirmation on registration', () => {
    const page = read('app/register/page.tsx');
    for (const field of ['displayName', 'identifier', 'password', 'confirmPassword']) {
      expect(page).toContain(field);
    }
  });

  it('migrates existing users to a unique phone-or-email login identifier', () => {
    const migration = read('db/migrations/002_secure_identifiers.sql');
    expect(migration).toContain('users_login_identifier_unique_idx');
    expect(migration).toContain('users_single_login_identifier_check');
    expect(migration).toContain("kind IN ('login', 'register')");
  });
});
