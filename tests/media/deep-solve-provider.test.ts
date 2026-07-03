import { afterEach, describe, expect, it, vi } from 'vitest';

import { VIDEO_PROVIDERS } from '@/lib/media/video-providers';
import {
  submitDeepSolveTask,
  pollDeepSolveTask,
} from '@/lib/media/adapters/deep-solve-adapter';
import type { VideoGenerationConfig, VideoGenerationOptions } from '@/lib/media/types';

const config: VideoGenerationConfig = {
  providerId: 'deep-solve',
  apiKey: '',
  baseUrl: 'http://localhost:8010',
};
const options: VideoGenerationOptions = { prompt: '求椭圆的离心率' };

function mockFetchOnce(status: number, json: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  })) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Deep Solve video provider', () => {
  it('is registered as a keyless 16:9 provider', () => {
    const p = VIDEO_PROVIDERS['deep-solve'];
    expect(p).toBeTruthy();
    expect(p.requiresApiKey).toBe(false);
    expect(p.supportedAspectRatios).toContain('16:9');
    expect(p.models.map((m) => m.id)).toContain('code2video');
  });

  it('submits a code2video task and returns the task_id', async () => {
    const fetchMock = mockFetchOnce(202, { task_id: 'dsv_20260703_abcd1234' });
    vi.stubGlobal('fetch', fetchMock);

    const taskId = await submitDeepSolveTask(config, options);

    expect(taskId).toBe('dsv_20260703_abcd1234');
    const [url, init] = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8010/api/v1/deep-solve/tasks');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.engine).toBe('code2video');
    expect(body.input.question).toBe(options.prompt);
  });

  it('returns null while the task is still running', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(200, { task_id: 't', state: 'running' }));
    const result = await pollDeepSolveTask(config, 't');
    expect(result).toBeNull();
  });

  it('resolves to the /video download URL when succeeded', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(200, {
        task_id: 't',
        state: 'succeeded',
        artifacts: [{ kind: 'final_video', path: '/x/final.mp4', url: null }],
      }),
    );
    const result = await pollDeepSolveTask(config, 't');
    expect(result?.url).toBe('http://localhost:8010/api/v1/deep-solve/tasks/t/video');
    expect(result?.width).toBe(854);
    expect(result?.height).toBe(480);
  });

  it('prefers a bridge-provided artifact url when present', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(200, {
        task_id: 't',
        state: 'succeeded',
        artifacts: [{ kind: 'final_video', path: '/x/final.mp4', url: 'http://host/dl.mp4' }],
      }),
    );
    const result = await pollDeepSolveTask(config, 't');
    expect(result?.url).toBe('http://host/dl.mp4');
  });

  it('throws when the task failed', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(200, { task_id: 't', state: 'failed', error: { message: 'render error' } }),
    );
    await expect(pollDeepSolveTask(config, 't')).rejects.toThrow(/render error/);
  });
});
