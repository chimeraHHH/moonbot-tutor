import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAuthEnabled: vi.fn(),
}));
const jobMocks = vi.hoisted(() => ({
  createClassroomGenerationJob: vi.fn(),
  isValidClassroomJobId: vi.fn(() => true),
  readClassroomGenerationJob: vi.fn(),
}));

vi.mock('@/lib/server/auth', () => authMocks);
vi.mock('@/lib/server/classroom-job-store', () => jobMocks);
vi.mock('@/lib/server/classroom-job-runner', () => ({ runClassroomGenerationJob: vi.fn() }));
vi.mock('@/lib/server/classroom-storage', () => ({
  buildRequestOrigin: vi.fn(() => 'http://sophos.local'),
}));

import { GET as getGenerationJob } from '@/app/api/generate-classroom/[jobId]/route';
import { POST as postGenerationJob } from '@/app/api/generate-classroom/route';

const student = { id: 'user-a', role: 'student' };

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.isAuthEnabled.mockReturnValue(true);
  authMocks.getCurrentUser.mockResolvedValue(student);
});

describe('classroom generation authorization', () => {
  it('rejects anonymous generation POST when auth is enabled', async () => {
    authMocks.getCurrentUser.mockResolvedValue(null);
    const response = await postGenerationJob(
      new NextRequest('http://sophos.local/api/generate-classroom', {
        method: 'POST',
        body: JSON.stringify({ requirement: 'teach calculus' }),
      }),
    );
    expect(response.status).toBe(401);
    expect(jobMocks.createClassroomGenerationJob).not.toHaveBeenCalled();
  });

  it('hides legacy ownerless jobs from non-admin users', async () => {
    jobMocks.readClassroomGenerationJob.mockResolvedValue({
      id: 'job-a',
      ownerUserId: null,
      status: 'running',
      step: 'rendering',
      progress: 50,
      message: 'running',
      scenesGenerated: 1,
    });
    const response = await getGenerationJob(
      new NextRequest('http://sophos.local/api/generate-classroom/job-a'),
      { params: Promise.resolve({ jobId: 'job-a' }) },
    );
    expect(response.status).toBe(404);
  });

  it('allows the matching owner to read a job', async () => {
    jobMocks.readClassroomGenerationJob.mockResolvedValue({
      id: 'job-a',
      ownerUserId: student.id,
      status: 'running',
      step: 'rendering',
      progress: 50,
      message: 'running',
      scenesGenerated: 1,
    });
    const response = await getGenerationJob(
      new NextRequest('http://sophos.local/api/generate-classroom/job-a'),
      { params: Promise.resolve({ jobId: 'job-a' }) },
    );
    expect(response.status).toBe(200);
  });
});
