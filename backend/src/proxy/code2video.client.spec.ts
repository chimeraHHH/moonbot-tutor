import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  BadGatewayException,
  NotFoundException,
} from '@nestjs/common';
import { Code2VideoClient } from './code2video.client';

/** Minimal Response-like object for mocking global fetch. */
function fakeResponse(opts: {
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
  body?: ReadableStream<Uint8Array> | null;
}): Response {
  const status = opts.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) => (opts.headers ?? {})[k.toLowerCase()] ?? null,
    },
    json: async () => opts.json ?? {},
    text: async () => opts.text ?? '',
    body: opts.body ?? null,
  } as unknown as Response;
}

function makeClient(base = 'http://code2video:8010'): Code2VideoClient {
  const config = { get: (k: string, d?: string) => (k === 'CODE2VIDEO_BASE_URL' ? base : d) };
  return new Code2VideoClient(config as unknown as ConfigService);
}

describe('Code2VideoClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createTask', () => {
    it('POSTs the code2video shape and returns the parsed body', async () => {
      fetchMock.mockResolvedValue(
        fakeResponse({
          json: { task_id: 't-1', state: 'queued', events_url: 'e', status_url: 's', cancel_url: 'c', created_at: 'now' },
        }),
      );
      const client = makeClient();
      const res = await client.createTask('what is a derivative?', 'calc 1');

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://code2video:8010/api/v1/deep-solve/tasks');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({
        engine: 'code2video',
        input: { question: 'what is a derivative?', context: 'calc 1' },
      });
      expect(res.task_id).toBe('t-1');
    });

    it('maps a 400 to BadRequestException', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 400, text: 'bad input' }));
      await expect(makeClient().createTask('q', '')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps a 500 to BadGatewayException', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 502, text: 'boom' }));
      await expect(makeClient().createTask('q', '')).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('passes a network error through as a thrown Error', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(makeClient().createTask('q', '')).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('getTask', () => {
    it('GETs the task and returns the parsed body', async () => {
      fetchMock.mockResolvedValue(
        fakeResponse({
          json: { task_id: 't-9', state: 'running', current_stage: 'render', progress: 0.5, stages: {}, artifacts: [], error: null },
        }),
      );
      const res = await makeClient().getTask('t-9');
      expect(fetchMock.mock.calls[0][0]).toBe('http://code2video:8010/api/v1/deep-solve/tasks/t-9');
      expect(res.current_stage).toBe('render');
    });

    it('maps a 404 to NotFoundException', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 404, text: 'no task' }));
      await expect(makeClient().getTask('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getVideo', () => {
    it('returns a node Readable stream + content type from the downstream body', async () => {
      const webStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });
      fetchMock.mockResolvedValue(
        fakeResponse({ headers: { 'content-type': 'video/mp4' }, body: webStream }),
      );
      const { stream, contentType } = await makeClient().getVideo('t-1');
      expect(contentType).toBe('video/mp4');
      const chunks: number[] = [];
      for await (const chunk of stream) chunks.push(...chunk);
      expect(chunks).toEqual([1, 2, 3]);
    });

    it('maps a 404 to NotFoundException', async () => {
      fetchMock.mockResolvedValue(fakeResponse({ status: 404, text: 'not rendered' }));
      await expect(makeClient().getVideo('t-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('streamEvents', () => {
    it('parses SSE data: lines and yields their payloads', async () => {
      const encoder = new TextEncoder();
      const webStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"stage":"code"}\n\n'));
          controller.enqueue(encoder.encode('data: {"stage":"render"}\n\n'));
          controller.close();
        },
      });
      fetchMock.mockResolvedValue(fakeResponse({ body: webStream }));

      const out: string[] = [];
      for await (const d of makeClient().streamEvents('t-1')) out.push(d);
      expect(out).toEqual(['{"stage":"code"}', '{"stage":"render"}']);
      expect(fetchMock.mock.calls[0][0]).toBe('http://code2video:8010/api/v1/deep-solve/tasks/t-1/events');
    });
  });

  it('strips trailing slashes from the base url', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ json: { task_id: 'x', state: 'queued' } }));
    const client = makeClient('http://code2video:8010///');
    await client.createTask('q', '');
    expect(fetchMock.mock.calls[0][0]).toBe('http://code2video:8010/api/v1/deep-solve/tasks');
  });
});
