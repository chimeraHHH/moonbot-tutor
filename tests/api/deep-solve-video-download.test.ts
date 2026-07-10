import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveVideoBaseUrl: vi.fn(),
}));

vi.mock('@/lib/server/provider-config', () => ({
  resolveVideoBaseUrl: mocks.resolveVideoBaseUrl,
}));

import { GET } from '@/app/api/generate/video/deep-solve/[taskId]/route';

describe('Deep Solve same-origin video download', () => {
  beforeEach(() => {
    mocks.resolveVideoBaseUrl.mockReturnValue('http://localhost:8010/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an invalid task id before contacting the bridge', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(new Request('http://localhost/video') as never, {
      params: Promise.resolve({ taskId: '../private' }),
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streams a generated animation from the configured bridge', async () => {
    const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
    const fetchMock = vi.fn(
      async () =>
        new Response(bytes, {
          status: 200,
          headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.length) },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(new Request('http://localhost/video') as never, {
      params: Promise.resolve({ taskId: 'dsv_20260711_abcd1234' }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8010/api/v1/deep-solve/tasks/dsv_20260711_abcd1234/video',
      { cache: 'no-store' },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
});
