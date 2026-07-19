import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adminMocks = vi.hoisted(() => ({
  findClassroomOwnershipRecord: vi.fn(),
  upsertClassroomRecord: vi.fn(),
}));

vi.mock('@/lib/server/admin-records', () => {
  class ClassroomOwnershipConflictError extends Error {
    constructor(classroomId: string) {
      super(`Classroom id is already owned by another user: ${classroomId}`);
      this.name = 'ClassroomOwnershipConflictError';
    }
  }
  return { ClassroomOwnershipConflictError, ...adminMocks };
});

let tempRoot: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  tempRoot = await mkdtemp(path.join(tmpdir(), 'sophos-classroom-security-'));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('classroom filesystem ownership', () => {
  it('does not let a user claim a legacy JSON file without an ownership row', async () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
    const { CLASSROOMS_DIR, persistClassroom } = await import('@/lib/server/classroom-storage');
    cwd.mockRestore();

    await mkdir(CLASSROOMS_DIR, { recursive: true });
    const legacyPath = path.join(CLASSROOMS_DIR, 'legacy-course.json');
    const original = '{"legacy":true}\n';
    await writeFile(legacyPath, original, 'utf8');
    adminMocks.findClassroomOwnershipRecord.mockResolvedValue(null);

    await expect(
      persistClassroom(
        {
          id: 'legacy-course',
          stage: { id: 'legacy-course', name: 'Attacker replacement' } as never,
          scenes: [],
          ownerUserId: 'user-a',
        },
        'https://sophos.local',
      ),
    ).rejects.toMatchObject({ name: 'ClassroomOwnershipConflictError' });

    expect(adminMocks.upsertClassroomRecord).not.toHaveBeenCalled();
    await expect(readFile(legacyPath, 'utf8')).resolves.toBe(original);
  });
});
