import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { CreateTaskDto } from './create-task.dto';

/**
 * ProxyService — will forward calls to the FastAPI code2video service
 * (CODE2VIDEO_BASE_URL, default http://localhost:8010).
 *
 * Implementation deferred. For now it returns NotImplemented-style payloads
 * so the API contract is exercised end-to-end without a downstream dependency.
 */
@Injectable()
export class ProxyService {
  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('CODE2VIDEO_BASE_URL', 'http://localhost:8010');
  }

  createTask(dto: CreateTaskDto) {
    return {
      implemented: false,
      message: 'Forwarding to code2video is not wired up yet.',
      downstream: this.baseUrl,
      received: dto,
    };
  }

  getTask(taskId: string) {
    return {
      taskId,
      implemented: false,
      status: 'unknown',
      downstream: this.baseUrl,
    };
  }

  taskEvents(_taskId: string): Observable<MessageEvent> {
    // Placeholder: emit a single not-implemented event so the SSE route typechecks.
    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next(
        new MessageEvent('message', {
          data: JSON.stringify({ implemented: false, downstream: this.baseUrl }),
        }),
      );
      subscriber.complete();
    });
  }
}
