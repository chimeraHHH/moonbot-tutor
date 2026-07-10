import { afterEach, describe, expect, it, vi } from 'vitest';

import { VIDEO_PROVIDERS } from '@/lib/media/video-providers';
import {
  submitDeepSolveTask,
  pollDeepSolveTask,
  deepSolveTaskIdFromVideoUrl,
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
    expect(body.input.context).toContain('所有旁白和 TTS 文本必须使用简体中文');
    expect(body.input.mode).toBe('problem_solving');
  });

  it('submits structured page context for narrative storyboard mode', async () => {
    const fetchMock = mockFetchOnce(202, { task_id: 'narrative-task' });
    vi.stubGlobal('fetch', fetchMock);

    await submitDeepSolveTask(config, {
      ...options,
      deepSolveMode: 'narrative_storyboard',
      narrativeContext: {
        pageTitle: '从混沌初开到人类繁衍',
        teachingNote: '盘古与女娲代表先民对宇宙起源的浪漫解读。',
        keyPoints: ['盘古开天辟地', '女娲创造人类'],
        targetLanguage: 'zh-CN',
      },
    });

    const [, init] = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.input.mode).toBe('narrative_storyboard');
    expect(body.input.narrative_context).toMatchObject({
      page_title: '从混沌初开到人类繁衍',
      teaching_note: '盘古与女娲代表先民对宇宙起源的浪漫解读。',
      key_points: ['盘古开天辟地', '女娲创造人类'],
      target_language: 'zh-CN',
    });
  });

  it('extracts a task id for the same-origin video download route', () => {
    expect(
      deepSolveTaskIdFromVideoUrl(
        'http://localhost:8010/api/v1/deep-solve/tasks/dsv_20260703_abcd1234/video',
      ),
    ).toBe('dsv_20260703_abcd1234');
    expect(deepSolveTaskIdFromVideoUrl('https://cdn.example.com/final.mp4')).toBeNull();
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

  it('uses the canonical task download URL even when the artifact includes a URL', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(200, {
        task_id: 't',
        state: 'succeeded',
        artifacts: [{ kind: 'final_video', path: '/x/final.mp4', url: 'http://host/dl.mp4' }],
      }),
    );
    const result = await pollDeepSolveTask(config, 't');
    expect(result?.url).toBe('http://localhost:8010/api/v1/deep-solve/tasks/t/video');
  });

  it('throws when the task failed', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(200, { task_id: 't', state: 'failed', error: { message: 'render error' } }),
    );
    await expect(pollDeepSolveTask(config, 't')).rejects.toThrow(/render error/);
  });
});
