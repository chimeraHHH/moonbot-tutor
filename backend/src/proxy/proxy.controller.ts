import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CreateTaskDto } from './dtos';
import { ProxyService } from './proxy.service';

/**
 * ProxyController — the BFF surface defined in `openapi.yaml`.
 * Forwards to the FastAPI code2video (Deep Solve) service via ProxyService.
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

  /** Stream the rendered explainer video. */
  @Get('tasks/:taskId/video')
  async getVideo(
    @Param('taskId') taskId: string,
  ): Promise<StreamableFile> {
    const { stream, contentType } = await this.proxy.getVideo(taskId);
    return new StreamableFile(stream, { type: contentType });
  }
}
