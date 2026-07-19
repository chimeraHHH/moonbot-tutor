import { describe, expect, it } from 'vitest';
import { isValidClassroomJobId } from '@/lib/server/classroom-job-store';

describe('classroom generation job ids', () => {
  it('accepts bounded safe ids and rejects empty, oversized, or traversal ids', () => {
    expect(isValidClassroomJobId('job_123-safe')).toBe(true);
    expect(isValidClassroomJobId('')).toBe(false);
    expect(isValidClassroomJobId('a'.repeat(129))).toBe(false);
    expect(isValidClassroomJobId('../job')).toBe(false);
  });
});
