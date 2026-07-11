import { describe, expect, it } from 'vitest';
import { normalizeSingleTeacherAgents } from '@/lib/orchestration/single-teacher-agents';

describe('normalizeSingleTeacherAgents', () => {
  it('keeps only the first teacher and enforces teacher priority', () => {
    const agents = normalizeSingleTeacherAgents([
      { name: '助教', role: 'assistant', priority: 7 },
      { name: '王老师', role: 'teacher', priority: 3 },
      { name: '学生', role: 'student', priority: 5 },
    ]);

    expect(agents).toEqual([{ name: '王老师', role: 'teacher', priority: 10 }]);
  });

  it('promotes the first returned profile when the model omitted a teacher', () => {
    const agents = normalizeSingleTeacherAgents([
      { name: '课程导师', role: 'assistant', priority: 7 },
      { name: '讨论伙伴', role: 'student', priority: 5 },
    ]);

    expect(agents).toEqual([{ name: '课程导师', role: 'teacher', priority: 10 }]);
  });

  it('rejects an empty agent response', () => {
    expect(() => normalizeSingleTeacherAgents([])).toThrow('Expected at least one agent');
  });
});
