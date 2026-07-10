import { describe, it, expect, beforeEach } from 'vitest';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(() => {
    // Direct instantiation — no DI container needed, avoids decorator-metadata concerns in Vitest.
    controller = new AppController(new AppService());
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('health returns status ok', () => {
    const result = controller.getHealth();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('moonbot-tutor-backend');
  });
});
