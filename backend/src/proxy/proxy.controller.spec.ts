import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamableFile } from '@nestjs/common';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';
import { CreateTaskDto, TaskStatusDto } from './dtos';

function mockService(): ProxyService {
  return {
    createTask: vi.fn(),
    getTask: vi.fn(),
    getVideo: vi.fn(),
    taskEvents: vi.fn(),
  } as unknown as ProxyService;
}

describe('ProxyController', () => {
  let service: ProxyService;
  let controller: ProxyController;

  beforeEach(() => {
    service = mockService();
    controller = new ProxyController(service);
  });

  it('createTask delegates to the service with the validated dto', async () => {
    const dto: CreateTaskDto = { question: 'chain rule' };
    (service.createTask as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskId: 't-1',
      status: 'queued',
      stages: [],
    });
    const res = await controller.createTask(dto);
    expect(service.createTask).toHaveBeenCalledWith(dto);
    expect(res.taskId).toBe('t-1');
  });

  it('getTask delegates with the route param', async () => {
    const status: TaskStatusDto = {
      taskId: 't-7', status: 'running', stage: 'code', progress: 0.3, videoUrl: null, error: null,
    };
    (service.getTask as ReturnType<typeof vi.fn>).mockResolvedValue(status);
    await controller.getTask('t-7');
    expect(service.getTask).toHaveBeenCalledWith('t-7');
  });

  it('getVideo returns a StreamableFile built from the service result', async () => {
    (service.getVideo as ReturnType<typeof vi.fn>).mockResolvedValue({
      stream: {} as never,
      contentType: 'video/mp4',
    });
    const res = await controller.getVideo('t-1');
    expect(res).toBeInstanceOf(StreamableFile);
    expect(service.getVideo).toHaveBeenCalledWith('t-1');
  });

  it('taskEvents delegates to the service observable', () => {
    const obs = { subscribe: vi.fn() };
    (service.taskEvents as ReturnType<typeof vi.fn>).mockReturnValue(obs);
    const res = controller.taskEvents('t-1');
    expect(res).toBe(obs);
    expect(service.taskEvents).toHaveBeenCalledWith('t-1');
  });
});
