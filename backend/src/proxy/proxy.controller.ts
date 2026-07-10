import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CreateTaskDto } from './create-task.dto';
import { ProxyService } from './proxy.service';

/**
 * ProxyController — the BFF surface.
 *
 * These endpoints mirror `openapi.yaml` and are intended to forward to the
 * FastAPI code2video (Deep Solve) service. Implementation is deferred; for now
 * they return 501 so the contract is testable but not yet wired.
 */
@Controller('api/v1')
export class ProxyController {
  constructor(private readonly proxy: ProxyService) {}

  /** Create a new Manim explainer task. */
  @Post('tasks')
  @HttpCode(HttpStatus.ACCEPTED)
  createTask(@Body() dto: CreateTaskDto) {
    return this.proxy.createTask(dto);
  }

  /** Poll a task's status. */
  @Get('tasks/:taskId')
  getTask(@Param('taskId') taskId: string) {
    return this.proxy.getTask(taskId);
  }

  /** Stream stage progress events (Server-Sent Events). */
  @Sse('tasks/:taskId/events')
  taskEvents(@Param('taskId') taskId: string): Observable<MessageEvent> {
    return this.proxy.taskEvents(taskId);
  }

  /** Resolve the rendered video for a finished task. */
  @Get('tasks/:taskId/video')
  getVideo(@Param('taskId') taskId: string) {
    throw new NotFoundException('video result not available yet');
  }
}
