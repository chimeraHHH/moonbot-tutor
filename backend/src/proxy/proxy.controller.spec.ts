import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ProxyService } from './proxy.service';

describe('ProxyService', () => {
  const config = { get: (k: string, d?: string) => d } as unknown as ConfigService;
  const service = new ProxyService(config);

  it('createTask echoes the received dto and marks itself unimplemented', () => {
    const res = service.createTask({ question: 'What is a derivative?' });
    expect(res.implemented).toBe(false);
    expect(res.received.question).toBe('What is a derivative?');
  });

  it('getTask reports unknown status until wired', () => {
    const res = service.getTask('job-123');
    expect(res.taskId).toBe('job-123');
    expect(res.status).toBe('unknown');
  });
});
