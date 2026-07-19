import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isClassroomShareRequest } from '@/proxy';

const shareToken =
  '550e8400-e29b-41d4-a716-446655440000.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

beforeEach(() => vi.stubEnv('AUTH_PUBLIC_URL', 'https://sophos.local'));
afterEach(() => vi.unstubAllEnvs());

describe('classroom share proxy boundary', () => {
  it('allows shaped GET page, classroom API and media requests to reach DB authorization', () => {
    expect(
      isClassroomShareRequest(
        new NextRequest(`https://sophos.local/classroom/class-a?shareToken=${shareToken}`),
      ),
    ).toBe(true);
    expect(
      isClassroomShareRequest(
        new NextRequest(`https://sophos.local/api/classroom?id=class-a&shareToken=${shareToken}`),
      ),
    ).toBe(true);
    expect(
      isClassroomShareRequest(
        new NextRequest('https://sophos.local/api/classroom-media/class-a/media/a.mp4', {
          headers: { authorization: `Bearer ${shareToken}` },
        }),
      ),
    ).toBe(true);
  });

  it('allows the short-lived HttpOnly media cookie established by classroom GET', () => {
    expect(
      isClassroomShareRequest(
        new NextRequest('https://sophos.local/api/classroom-media/class-a/audio/a.mp3', {
          headers: { cookie: `sophos_classroom_share_class-a=${shareToken}` },
        }),
      ),
    ).toBe(true);
  });

  it('does not bypass auth for malformed tokens, unrelated APIs or mutations', () => {
    expect(
      isClassroomShareRequest(
        new NextRequest('https://sophos.local/api/classroom?id=class-a&shareToken=guessable'),
      ),
    ).toBe(false);
    expect(
      isClassroomShareRequest(
        new NextRequest(`https://sophos.local/api/admin/users?shareToken=${shareToken}`),
      ),
    ).toBe(false);
    expect(
      isClassroomShareRequest(
        new NextRequest(`https://sophos.local/api/classroom?id=class-a&shareToken=${shareToken}`, {
          method: 'POST',
        }),
      ),
    ).toBe(false);
  });

  it('does not bypass authentication on a plaintext request even with a shaped token', () => {
    expect(
      isClassroomShareRequest(
        new NextRequest(`http://sophos.local/classroom/class-a?shareToken=${shareToken}`),
      ),
    ).toBe(false);
  });
});
