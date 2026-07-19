import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSessionCookieOptions: vi.fn(() => ({ secure: false })),
  isAuthEnabled: vi.fn(),
}));
const storageMocks = vi.hoisted(() => ({
  buildRequestOrigin: vi.fn(() => 'http://sophos.local'),
  isValidClassroomId: vi.fn((id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id)),
  persistClassroom: vi.fn(),
  readClassroom: vi.fn(),
  CLASSROOMS_DIR: '/tmp/sophos-test-classrooms',
}));
const accessMocks = vi.hoisted(() => ({
  authorizeClassroomAccess: vi.fn(),
  classroomShareCookieName: vi.fn((id: string) => `sophos_classroom_share_${id}`),
  createClassroomShare: vi.fn(),
  getSecureClassroomShareOrigin: vi.fn((): string | null => 'https://sophos.local'),
  isSecureClassroomShareTransport: vi.fn(() => true),
  isValidClassroomShareId: vi.fn(() => true),
  listClassroomShares: vi.fn(),
  readClassroomShareToken: vi.fn(),
  revokeClassroomShare: vi.fn(),
}));

vi.mock('@/lib/server/auth', () => authMocks);
vi.mock('@/lib/server/classroom-storage', () => storageMocks);
vi.mock('@/lib/server/classroom-access', () => accessMocks);

import { ClassroomOwnershipConflictError } from '@/lib/server/admin-records';
import { GET as getClassroom, POST as postClassroom } from '@/app/api/classroom/route';
import {
  classroomMediaCacheControl,
  classroomMediaContentType,
  GET as getClassroomMedia,
} from '@/app/api/classroom-media/[classroomId]/[...path]/route';
import { POST as createShare } from '@/app/api/classroom/[id]/shares/route';
import { DELETE as revokeShare } from '@/app/api/classroom/[id]/shares/[shareId]/route';

const student = { id: 'user-a', role: 'student' };

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.isAuthEnabled.mockReturnValue(true);
  authMocks.getCurrentUser.mockResolvedValue(student);
  accessMocks.authorizeClassroomAccess.mockResolvedValue({
    allowed: true,
    reason: 'owner',
    user: student,
  });
});

describe('classroom route authorization', () => {
  it('rejects anonymous classroom POST when auth is enabled', async () => {
    authMocks.getCurrentUser.mockResolvedValue(null);
    const response = await postClassroom(
      new NextRequest('http://sophos.local/api/classroom', {
        method: 'POST',
        body: JSON.stringify({ stage: { id: 'class-a', name: 'A' }, scenes: [] }),
      }),
    );
    expect(response.status).toBe(401);
    expect(storageMocks.persistClassroom).not.toHaveBeenCalled();
  });

  it('keeps auth-disabled local classroom POST working', async () => {
    authMocks.isAuthEnabled.mockReturnValue(false);
    authMocks.getCurrentUser.mockResolvedValue(null);
    storageMocks.persistClassroom.mockResolvedValue({ id: 'class-a', url: '/classroom/class-a' });
    const response = await postClassroom(
      new NextRequest('http://sophos.local/api/classroom', {
        method: 'POST',
        body: JSON.stringify({ stage: { id: 'class-a', name: 'A' }, scenes: [] }),
      }),
    );
    expect(response.status).toBe(201);
  });

  it('returns 409 without overwriting when a classroom id belongs to another user', async () => {
    storageMocks.persistClassroom.mockRejectedValue(new ClassroomOwnershipConflictError('class-b'));
    const response = await postClassroom(
      new NextRequest('http://sophos.local/api/classroom', {
        method: 'POST',
        body: JSON.stringify({ stage: { id: 'class-b', name: 'B' }, scenes: [] }),
      }),
    );
    expect(response.status).toBe(409);
  });

  it('rejects traversal and malformed classroom payloads before persistence', async () => {
    for (const payload of [
      { stage: { id: '../../etc/passwd', name: 'bad' }, scenes: [] },
      { stage: { id: 'class-a', name: 'bad' }, scenes: {} },
      { stage: 'class-a', scenes: [] },
    ]) {
      const response = await postClassroom(
        new NextRequest('http://sophos.local/api/classroom', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(storageMocks.persistClassroom).not.toHaveBeenCalled();
  });

  it('does not read classroom JSON after an A/B access denial', async () => {
    accessMocks.authorizeClassroomAccess.mockResolvedValue({
      allowed: false,
      status: 404,
      user: student,
    });
    const response = await getClassroom(
      new NextRequest('http://sophos.local/api/classroom?id=class-b'),
    );
    expect(response.status).toBe(404);
    expect(storageMocks.readClassroom).not.toHaveBeenCalled();
  });

  it('does not touch the filesystem after a classroom-media access denial', async () => {
    accessMocks.authorizeClassroomAccess.mockResolvedValue({
      allowed: false,
      status: 404,
      user: student,
    });
    const response = await getClassroomMedia(
      new NextRequest('http://sophos.local/api/classroom-media/class-b/media/secret.mp4'),
      { params: Promise.resolve({ classroomId: 'class-b', path: ['media', 'secret.mp4'] }) },
    );
    expect(response.status).toBe(404);
  });

  it('never caches share-token media while retaining a short private owner cache', () => {
    expect(classroomMediaCacheControl('share')).toBe('private, no-store');
    expect(classroomMediaCacheControl('owner')).toBe('private, max-age=300');
    expect(classroomMediaCacheControl('admin')).toBe('private, max-age=300');
    expect(classroomMediaContentType('/tmp/lesson.mp4')).toBe('video/mp4');
    expect(classroomMediaContentType('/tmp/lesson.html')).toBeNull();
  });
});

describe('classroom share management', () => {
  it('creates and revokes shares only through owner/admin authorization', async () => {
    accessMocks.createClassroomShare.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      token: '550e8400-e29b-41d4-a716-446655440000.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    accessMocks.revokeClassroomShare.mockResolvedValue(true);

    const createResponse = await createShare(
      new NextRequest('http://sophos.local/api/classroom/class-a/shares', {
        method: 'POST',
        body: JSON.stringify({ expiresInSeconds: 600 }),
      }),
      { params: Promise.resolve({ id: 'class-a' }) },
    );
    expect(createResponse.status).toBe(201);
    expect(accessMocks.authorizeClassroomAccess).toHaveBeenCalledWith({
      classroomId: 'class-a',
      ownerOnly: true,
    });

    const revokeResponse = await revokeShare(
      new NextRequest(
        'http://sophos.local/api/classroom/class-a/shares/550e8400-e29b-41d4-a716-446655440000',
        { method: 'DELETE' },
      ),
      {
        params: Promise.resolve({
          id: 'class-a',
          shareId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      },
    );
    expect(revokeResponse.status).toBe(200);
  });

  it('hides share management from a non-owner', async () => {
    accessMocks.authorizeClassroomAccess.mockResolvedValue({
      allowed: false,
      status: 404,
      user: student,
    });
    const response = await createShare(
      new NextRequest('http://sophos.local/api/classroom/class-b/shares', {
        method: 'POST',
        body: JSON.stringify({ expiresInSeconds: 600 }),
      }),
      { params: Promise.resolve({ id: 'class-b' }) },
    );
    expect(response.status).toBe(404);
    expect(accessMocks.createClassroomShare).not.toHaveBeenCalled();
  });

  it('refuses to issue bearer shares without an HTTPS public origin', async () => {
    accessMocks.getSecureClassroomShareOrigin.mockReturnValue(null);
    const response = await createShare(
      new NextRequest('http://sophos.local/api/classroom/class-a/shares', {
        method: 'POST',
        body: JSON.stringify({ expiresInSeconds: 600 }),
      }),
      { params: Promise.resolve({ id: 'class-a' }) },
    );
    expect(response.status).toBe(503);
    expect(accessMocks.createClassroomShare).not.toHaveBeenCalled();
  });

  it('refuses to issue bearer shares over a plaintext request path', async () => {
    accessMocks.isSecureClassroomShareTransport.mockReturnValue(false);
    const response = await createShare(
      new NextRequest('http://sophos.local/api/classroom/class-a/shares', {
        method: 'POST',
        body: JSON.stringify({ expiresInSeconds: 600 }),
      }),
      { params: Promise.resolve({ id: 'class-a' }) },
    );
    expect(response.status).toBe(503);
    expect(accessMocks.createClassroomShare).not.toHaveBeenCalled();
  });
});
