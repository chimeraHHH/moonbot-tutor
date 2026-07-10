import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';

/** code2video (Deep Solve) downstream response shapes. */
export interface C2VCreateResponse {
  task_id: string;
  state: string;
  events_url: string;
  status_url: string;
  cancel_url: string;
  created_at: string;
}

export interface C2VArtifact {
  kind: string;
  path: string;
  url?: string | null;
}

export interface C2VTaskStatus {
  task_id: string;
  state: string;
  current_stage: string | null;
  progress: number;
  stages: Record<string, unknown>;
  artifacts: C2VArtifact[];
  error: { code: string; message: string; stage?: string | null } | null;
}

export interface C2VVideo {
  stream: Readable;
  contentType: string;
}

/**
 * Thin HTTP client for the FastAPI code2video (Deep Solve) service.
 * All downstream errors are mapped to NestJS HTTP exceptions so the controller
 * layer stays simple. `fetch` is used directly so it is trivially mockable
 * (vi.stubGlobal('fetch', ...)) in tests.
 */
@Injectable()
export class Code2VideoClient {
  private readonly base: string;

  constructor(config: ConfigService) {
    const raw = config.get<string>('CODE2VIDEO_BASE_URL') || 'http://localhost:8010';
    this.base = raw.replace(/\/+$/, '');
  }

  private url(path: string): string {
    return `${this.base}/api/v1/deep-solve${path}`;
  }

  private async assertOk(res: Response, context: string): Promise<void> {
    if (res.ok) return;
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      /* ignore body read errors */
    }
    throw mapStatus(res.status, context, detail);
  }

  async createTask(question: string, context: string): Promise<C2VCreateResponse> {
    const res = await fetch(this.url('/tasks'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engine: 'code2video',
        input: { question, context: context ?? '' },
      }),
    });
    await this.assertOk(res, 'create task');
    return (await res.json()) as C2VCreateResponse;
  }

  async getTask(taskId: string): Promise<C2VTaskStatus> {
    const res = await fetch(this.url(`/tasks/${encodeURIComponent(taskId)}`));
    await this.assertOk(res, 'get task');
    return (await res.json()) as C2VTaskStatus;
  }

  async getVideo(taskId: string): Promise<C2VVideo> {
    const res = await fetch(this.url(`/tasks/${encodeURIComponent(taskId)}/video`));
    await this.assertOk(res, 'get video');
    const contentType = res.headers.get('content-type') || 'video/mp4';
    const stream = Readable.fromWeb(res.body as unknown as import('stream/web').ReadableStream);
    return { stream, contentType };
  }

  /**
   * Stream a task's SSE event feed, yielding each event's `data:` payload as a
   * string. The caller can abort via the signal.
   */
  async *streamEvents(
    taskId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, unknown> {
    const res = await fetch(this.url(`/tasks/${encodeURIComponent(taskId)}/events`), {
      signal,
    });
    await this.assertOk(res, 'stream events');
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const dataLine = block
            .split('\n')
            .find((l) => l.startsWith('data:'));
          if (dataLine) yield dataLine.slice('data:'.length).trim();
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

function mapStatus(status: number, context: string, detail: string): HttpException {
  const msg = `code2video ${context} failed (${status})${detail ? `: ${detail}` : ''}`;
  if (status === 400 || status === 422) return new BadRequestException(msg);
  if (status === 404) return new NotFoundException(msg);
  if (status >= 500) return new BadGatewayException(msg);
  return new HttpException({ statusCode: status, message: msg }, status);
}
