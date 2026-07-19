import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@/lib/server/auth-types';

const authMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAuthEnabled: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn() }));

vi.mock('@/lib/server/auth', () => authMocks);
vi.mock('@/lib/server/db', () => dbMocks);

import {
  authorizeClassroomAccess,
  createClassroomShare,
  hashClassroomShareToken,
} from '@/lib/server/classroom-access';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const userA: AuthUser = {
  id: 'user-a',
  loginIdentifier: 'a@example.com',
  identifierType: 'email',
  email: 'a@example.com',
  phone: null,
  displayName: 'A',
  role: 'student',
  status: 'active',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  lastLoginAt: null,
};
const userB = { ...userA, id: 'user-b', email: 'b@example.com' } satisfies AuthUser;
const admin = { ...userA, id: 'admin', role: 'admin' } satisfies AuthUser;
const shareId = '550e8400-e29b-41d4-a716-446655440000';
const shareToken = `${shareId}.${'a'.repeat(43)}`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AUTH_PUBLIC_URL', 'https://sophos.local');
  authMocks.isAuthEnabled.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('central classroom access policy', () => {
  it('allows the owner and admin, but hides another user classroom as 404', async () => {
    dbMocks.queryOne.mockResolvedValue({ id: 'class-a', ownerUserId: userA.id });

    authMocks.getCurrentUser.mockResolvedValue(userA);
    await expect(authorizeClassroomAccess({ classroomId: 'class-a' })).resolves.toMatchObject({
      allowed: true,
      reason: 'owner',
    });

    authMocks.getCurrentUser.mockResolvedValue(userB);
    await expect(authorizeClassroomAccess({ classroomId: 'class-a' })).resolves.toEqual({
      allowed: false,
      status: 404,
      user: userB,
    });

    authMocks.getCurrentUser.mockResolvedValue(admin);
    await expect(authorizeClassroomAccess({ classroomId: 'class-a' })).resolves.toMatchObject({
      allowed: true,
      reason: 'admin',
    });
  });

  it('fails closed for ownerless records and anonymous requests', async () => {
    dbMocks.queryOne.mockResolvedValue({ id: 'legacy', ownerUserId: null });

    authMocks.getCurrentUser.mockResolvedValue(userA);
    await expect(authorizeClassroomAccess({ classroomId: 'legacy' })).resolves.toMatchObject({
      allowed: false,
      status: 404,
    });

    authMocks.getCurrentUser.mockResolvedValue(null);
    await expect(authorizeClassroomAccess({ classroomId: 'legacy' })).resolves.toMatchObject({
      allowed: false,
      status: 401,
    });
  });

  it('accepts an active classroom-bound token and rejects it across resources', async () => {
    authMocks.getCurrentUser.mockResolvedValue(null);
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: 'class-a', ownerUserId: userA.id })
      .mockResolvedValueOnce({
        id: shareId,
        classroomId: 'class-a',
        tokenHash: hashClassroomShareToken(shareToken),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      });
    await expect(
      authorizeClassroomAccess({
        classroomId: 'class-a',
        shareToken,
        secureShareTransport: true,
      }),
    ).resolves.toMatchObject({ allowed: true, reason: 'share' });

    dbMocks.queryOne
      .mockResolvedValueOnce({ id: 'class-b', ownerUserId: userB.id })
      .mockResolvedValueOnce({
        id: shareId,
        classroomId: 'class-a',
        tokenHash: hashClassroomShareToken(shareToken),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      });
    await expect(
      authorizeClassroomAccess({
        classroomId: 'class-b',
        shareToken,
        secureShareTransport: true,
      }),
    ).resolves.toMatchObject({ allowed: false, status: 404 });
  });

  it('rejects revoked and expired tokens and never treats a token as owner access', async () => {
    authMocks.getCurrentUser.mockResolvedValue(null);
    for (const share of [
      {
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
      },
      {
        expiresAt: new Date(Date.now() - 1_000),
        revokedAt: null,
      },
    ]) {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: 'class-a', ownerUserId: userA.id })
        .mockResolvedValueOnce({
          id: shareId,
          classroomId: 'class-a',
          tokenHash: hashClassroomShareToken(shareToken),
          ...share,
        });
      await expect(
        authorizeClassroomAccess({
          classroomId: 'class-a',
          shareToken,
          secureShareTransport: true,
        }),
      ).resolves.toMatchObject({ allowed: false, status: 404 });
    }

    dbMocks.queryOne.mockResolvedValueOnce({ id: 'class-a', ownerUserId: userA.id });
    await expect(
      authorizeClassroomAccess({ classroomId: 'class-a', shareToken, ownerOnly: true }),
    ).resolves.toMatchObject({ allowed: false, status: 404 });
  });

  it('keeps auth-disabled local development available', async () => {
    authMocks.isAuthEnabled.mockReturnValue(false);
    await expect(authorizeClassroomAccess({ classroomId: 'local' })).resolves.toMatchObject({
      allowed: true,
      reason: 'local-development',
    });
    expect(dbMocks.queryOne).not.toHaveBeenCalled();
  });

  it('rejects bearer-share authorization on an HTTP deployment', async () => {
    vi.stubEnv('AUTH_PUBLIC_URL', 'http://sophos.local');
    authMocks.getCurrentUser.mockResolvedValue(null);
    dbMocks.queryOne.mockResolvedValue({ id: 'class-a', ownerUserId: userA.id });

    await expect(
      authorizeClassroomAccess({
        classroomId: 'class-a',
        shareToken,
        secureShareTransport: true,
      }),
    ).resolves.toMatchObject({ allowed: false, status: 404 });
    expect(dbMocks.queryOne).toHaveBeenCalledTimes(1);
  });
});

describe('classroom share persistence', () => {
  it('stores only a hash and returns the bearer secret once', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    dbMocks.queryOne.mockImplementation(async (_sql: string, params: unknown[]) => ({
      id: params[0],
      expiresAt,
    }));

    const share = await createClassroomShare({
      classroomId: 'class-a',
      createdByUserId: userA.id,
      expiresAt,
    });
    const [sql, params] = dbMocks.queryOne.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('token_hash');
    expect(params).not.toContain(share.token);
    expect(params[3]).toBe(hashClassroomShareToken(share.token));
    expect(params[3]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses an additive expiring and revocable migration with no plaintext token column', () => {
    const migration = read('db/migrations/004_classroom_shares.sql');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS classroom_shares');
    expect(migration).toContain('token_hash TEXT NOT NULL UNIQUE');
    expect(migration).toContain('expires_at TIMESTAMPTZ NOT NULL');
    expect(migration).toContain('revoked_at TIMESTAMPTZ');
    expect(migration).not.toMatch(/\btoken\s+TEXT\b/);
  });
});
