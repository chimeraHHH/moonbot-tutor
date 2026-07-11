import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  CreateTaskDto,
  CreateTaskResponseDto,
  PIPELINE_STAGES,
  TaskState,
  TaskStatusDto,
} from './dtos';
import {
  C2VTaskStatus,
  C2VVideo,
  Code2VideoClient,
} from './code2video.client';

/**
 * Maps between our openapi contract and code2video's shapes, delegating HTTP to
 * Code2VideoClient. Pure mapping logic — easy to unit test with a mocked client.
 */
@Injectable()
export class ProxyService {
  constructor(private readonly client: Code2VideoClient) {}

  async createTask(dto: CreateTaskDto): Promise<CreateTaskResponseDto> {
    const created = await this.client.createTask(dto.question, dto.context ?? '');
    return {
      taskId: created.task_id,
      status: created.state as TaskState,
      stages: [...PIPELINE_STAGES],
    };
  }

  async getTask(taskId: string): Promise<TaskStatusDto> {
    const t = await this.client.getTask(taskId);
    return {
      taskId: t.task_id,
      status: t.state as TaskState,
      stage: t.current_stage,
      progress: t.progress,
      videoUrl: deriveVideoUrl(t),
      error: t.error?.message ?? null,
    };
  }

  getVideo(taskId: string): Promise<C2VVideo> {
    return this.client.getVideo(taskId);
  }

  /**
   * Re-emit code2video's SSE feed as a NestJS Server-Sent-Events observable.
   * Aborts the downstream fetch when the client unsubscribes.
   */
  taskEvents(taskId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const controller = new AbortController();
      void (async () => {
        try {
          for await (const data of this.client.streamEvents(taskId, controller.signal)) {
            subscriber.next(new MessageEvent('message', { data }));
          }
          subscriber.complete();
        } catch (err) {
          if (!controller.signal.aborted) subscriber.error(err);
        }
      })();
      return () => controller.abort();
    });
  }
}

/** Pick a video URL from the task's artifacts, if one was produced. */
function deriveVideoUrl(t: C2VTaskStatus): string | null {
  const video = t.artifacts.find((a) => a.kind.toLowerCase().includes('video'));
  return video?.url ?? null;
}
