import { IsOptional, IsString, MinLength } from 'class-validator';

/** Request body for POST /api/v1/tasks (our openapi contract). */
export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  question!: string;

  @IsOptional()
  @IsString()
  context?: string;
}

export type TaskState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/** Response for POST /api/v1/tasks. */
export interface CreateTaskResponseDto {
  taskId: string;
  status: TaskState;
  stages: string[];
}

/** Response for GET /api/v1/tasks/{taskId}. */
export interface TaskStatusDto {
  taskId: string;
  status: TaskState;
  stage: string | null;
  progress: number;
  videoUrl: string | null;
  error: string | null;
}

/** Deep Solve pipeline stages, in order. */
export const PIPELINE_STAGES = [
  'llm1',
  'llm2',
  'storyboard',
  'audio',
  'code',
  'render',
  'merge',
] as const;
