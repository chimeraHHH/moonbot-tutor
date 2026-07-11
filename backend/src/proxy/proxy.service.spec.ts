import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyService } from './proxy.service';
import { Code2VideoClient } from './code2video.client';
import { CreateTaskDto, PIPELINE_STAGES } from './dtos';

function mockClient(): Code2VideoClient {
  return {
    createTask: vi.fn(),
    getTask: vi.fn(),
    getVideo: vi.fn(),
    streamEvents: vi.fn(),
  } as unknown as Code2VideoClient;
}

describe('ProxyService', () => {
  let client: Code2VideoClient;
  let service: ProxyService;

  beforeEach(() => {
    client = mockClient();
    service = new ProxyService(client);
  });

  describe('createTask', () => {
    it('maps code2video fields to our openapi response', async () => {
      (client.createTask as ReturnType<typeof vi.fn>).mockResolvedValue({
        task_id: 'abc-123',
        state: 'queued',
      });
      const res = await service.createTask({ question: 'chain rule' } as CreateTaskDto);

      expect(client.createTask).toHaveBeenCalledWith('chain rule', '');
      expect(res).toEqual({
        taskId: 'abc-123',
        status: 'queued',
        stages: [...PIPELINE_STAGES],
      });
    });

    it('forwards context when provided', async () => {
      (client.createTask as ReturnType<typeof vi.fn>).mockResolvedValue({ task_id: 't', state: 'queued' });
      await service.createTask({ question: 'q', context: 'ctx' } as CreateTaskDto);
      expect(client.createTask).toHaveBeenCalledWith('q', 'ctx');
    });
  });

  describe('getTask', () => {
    it('maps the full task status, deriving videoUrl from artifacts', async () => {
      (client.getTask as ReturnType<typeof vi.fn>).mockResolvedValue({
        task_id: 't-1',
        state: 'succeeded',
        current_stage: null,
        progress: 1,
        artifacts: [{ kind: 'final_video', path: '/x.mp4', url: 'http://c2v/video' }],
        error: null,
      });
      const res = await service.getTask('t-1');
      expect(res).toEqual({
        taskId: 't-1',
        status: 'succeeded',
        stage: null,
        progress: 1,
        videoUrl: 'http://c2v/video',
        error: null,
      });
    });

    it('returns null videoUrl when no video artifact exists', async () => {
      (client.getTask as ReturnType<typeof vi.fn>).mockResolvedValue({
        task_id: 't-2', state: 'running', current_stage: 'code', progress: 0.4, artifacts: [], error: null,
      });
      const res = await service.getTask('t-2');
      expect(res.videoUrl).toBeNull();
      expect(res.stage).toBe('code');
    });

    it('surfaces the downstream error message', async () => {
      (client.getTask as ReturnType<typeof vi.fn>).mockResolvedValue({
        task_id: 't-3', state: 'failed', current_stage: 'render', progress: 0.6, artifacts: [],
        error: { code: 'render_error', message: 'LaTeX missing' },
      });
      const res = await service.getTask('t-3');
      expect(res.status).toBe('failed');
      expect(res.error).toBe('LaTeX missing');
    });
  });

  describe('getVideo', () => {
    it('delegates straight to the client', async () => {
      const video = { stream: {}, contentType: 'video/mp4' };
      (client.getVideo as ReturnType<typeof vi.fn>).mockResolvedValue(video);
      await expect(service.getVideo('t-1')).resolves.toBe(video);
      expect(client.getVideo).toHaveBeenCalledWith('t-1');
    });
  });

  describe('taskEvents', () => {
    it('re-emits each SSE payload as a MessageEvent and completes', async () => {
      async function* gen() {
        yield '{"stage":"code"}';
        yield '{"stage":"render"}';
      }
      (client.streamEvents as ReturnType<typeof vi.fn>).mockReturnValue(gen());
      const events: string[] = [];
      await new Promise<void>((resolve) => {
        service.taskEvents('t-1').subscribe({
          next: (e) => events.push(e.data),
          complete: () => resolve(),
        });
      });
      expect(events).toEqual(['{"stage":"code"}', '{"stage":"render"}']);
    });

    it('aborts the downstream fetch on unsubscribe', () => {
      const abortSpy = vi.fn();
      (client.streamEvents as ReturnType<typeof vi.fn>).mockImplementation(
        (_id: string, signal?: AbortSignal) => {
          signal?.addEventListener('abort', abortSpy);
          return (async function* () {
            /* never yields */
          })();
        },
      );
      const sub = service.taskEvents('t-1').subscribe();
      sub.unsubscribe();
      expect(abortSpy).toHaveBeenCalled();
    });
  });
});
