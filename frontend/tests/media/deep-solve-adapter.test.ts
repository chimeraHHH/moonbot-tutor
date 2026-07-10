/**
 * Phase 2 TDD: the deep-solve adapter must talk to OUR NestJS openapi BFF
 * (POST /api/v1/tasks, GET /api/v1/tasks/{id}, GET .../video, GET /health),
 * NOT to code2video's /api/v1/deep-solve/* directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoGenerationConfig, VideoGenerationOptions } from '@/lib/media/types';
import {
  pollDeepSolveTask,
  submitDeepSolveTask,
  testDeepSolveConnectivity,
} from '@/lib/media/adapters/deep-solve-adapter';

const BASE = 'http://bff:3000';
const config = { baseUrl: BASE, apiKey: '' } as unknown as VideoGenerationConfig;
const opts = { prompt: 'pythagorean theorem' } as unknown as VideoGenerationOptions;

function jsonRes(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('deep-solve adapter → openapi BFF', () => {
  it('submits via POST /api/v1/tasks with {question, context}', async () => {
    fetchMock.mockResolvedValue(
      jsonRes({ taskId: 't-1', status: 'queued', stages: [] }, 202),
    );
    const id = await submitDeepSolveTask(config, opts);
    expect(id).toBe('t-1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/v1/tasks`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      question: 'pythagorean theorem',
      context: '',
    });
  });

  it('polls GET /api/v1/tasks/{id} and resolves the video url on success', async () => {
    fetchMock.mockResolvedValue(
      jsonRes({
        taskId: 't-1',
        status: 'succeeded',
        stage: null,
        progress: 100,
        videoUrl: `${BASE}/api/v1/tasks/t-1/video`,
        error: null,
      }),
    );
    const res = await pollDeepSolveTask(config, 't-1');
    expect(res).not.toBeNull();
    expect(res?.url).toBe(`${BASE}/api/v1/tasks/t-1/video`);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/tasks/t-1`);
  });

  it('returns null while the task is still running', async () => {
    fetchMock.mockResolvedValue(
      jsonRes({ taskId: 't-1', status: 'running', stage: 'code', progress: 40, videoUrl: null, error: null }),
    );
    expect(await pollDeepSolveTask(config, 't-1')).toBeNull();
  });

  it('throws when the task failed', async () => {
    fetchMock.mockResolvedValue(
      jsonRes({ taskId: 't-1', status: 'failed', stage: 'render', progress: 80, videoUrl: null, error: 'boom' }),
    );
    await expect(pollDeepSolveTask(config, 't-1')).rejects.toThrow(/failed/i);
  });

  it('connectivity probes GET /health', async () => {
    fetchMock.mockResolvedValue(jsonRes({ status: 'ok' }));
    const r = await testDeepSolveConnectivity(config);
    expect(r.success).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/health`);
  });
});
