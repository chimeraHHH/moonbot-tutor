import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  generateVideo: vi.fn(),
}));

vi.mock('@/lib/media/video-providers', () => ({
  VIDEO_PROVIDERS: {
    'deep-solve': { requiresApiKey: false },
  },
  normalizeVideoOptions: (_providerId: string, options: unknown) => options,
  generateVideo: mocks.generateVideo,
}));

vi.mock('@/lib/server/provider-config', () => ({
  isServerConfiguredProvider: () => true,
  resolveVideoApiKey: () => '',
  resolveVideoBaseUrl: () => 'http://localhost:8010',
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function makeRequest() {
  return new Request('http://localhost/api/generate/video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-video-provider': 'deep-solve',
    },
    body: JSON.stringify({ prompt: '讲解伏羲和女娲', aspectRatio: '16:9' }),
  }) as unknown as NextRequest;
}

describe('POST /api/generate/video with Deep Solve', () => {
  beforeEach(() => {
    mocks.generateVideo.mockReset();
  });

  it('returns a same-origin download path instead of the localhost bridge URL', async () => {
    mocks.generateVideo.mockResolvedValue({
      url: 'http://localhost:8010/api/v1/deep-solve/tasks/dsv_20260711_abcd1234/video',
      duration: 20,
      width: 854,
      height: 480,
    });

    const { POST } = await import('@/app/api/generate/video/route');
    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result.url).toBe('/api/generate/video/deep-solve/dsv_20260711_abcd1234');
  });
});
