import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { toProgressPercent } from '@/lib/teacher/progress';
import {
  createTeacherTaskToken,
  verifyTeacherTaskToken,
} from '@/lib/server/teacher-task-token';

let previousSecret: string | undefined;

beforeEach(() => {
  previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'teacher-task-test-secret-with-at-least-32-characters';
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = previousSecret;
});

describe('teacher task access', () => {
  it('binds a task token to both the task and the current user', () => {
    const token = createTeacherTaskToken('task-123', 'user-1');
    expect(verifyTeacherTaskToken(token, 'task-123', 'user-1')).toBe(true);
    expect(verifyTeacherTaskToken(token, 'task-456', 'user-1')).toBe(false);
    expect(verifyTeacherTaskToken(token, 'task-123', 'user-2')).toBe(false);
    expect(verifyTeacherTaskToken(`${token}x`, 'task-123', 'user-1')).toBe(false);
  });
});

describe('teacher progress display', () => {
  it('uses the server 0-100 contract and clamps invalid values', () => {
    expect(toProgressPercent(42.6)).toBe(43);
    expect(toProgressPercent(-5)).toBe(0);
    expect(toProgressPercent(125)).toBe(100);
    expect(toProgressPercent(Number.NaN)).toBe(0);
  });
});

describe('teacher task continuity', () => {
  it('keeps every generator mounted while switching teacher tabs', () => {
    const source = readFileSync(
      new URL('../components/teacher/teacher-workbench.tsx', import.meta.url),
      'utf8',
    );
    expect(source.match(/<TabsContent[^>]*forceMount/g)).toHaveLength(3);
  });

  it('restores asynchronous jobs after leaving and returning to the teacher page', () => {
    const deepSolveSource = readFileSync(
      new URL('../components/teacher/deep-solve-panel.tsx', import.meta.url),
      'utf8',
    );
    const pptSource = readFileSync(
      new URL('../components/teacher/ppt-generator-panel.tsx', import.meta.url),
      'utf8',
    );
    expect(deepSolveSource).toContain('asset.ref.taskAccessToken');
    expect(deepSolveSource).toContain('loadAssets().find');
    expect(pptSource).toContain('loadAssets().find');
  });
});
