import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import type { Scene, Stage } from '@/lib/types/stage';
import {
  ClassroomOwnershipConflictError,
  findClassroomOwnershipRecord,
  upsertClassroomRecord,
} from '@/lib/server/admin-records';

export const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');
export const CLASSROOM_JOBS_DIR = path.join(process.cwd(), 'data', 'classroom-jobs');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureClassroomsDir() {
  await ensureDir(CLASSROOMS_DIR);
}

export async function ensureClassroomJobsDir() {
  await ensureDir(CLASSROOM_JOBS_DIR);
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

export function buildRequestOrigin(req: NextRequest): string {
  return req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : req.nextUrl.origin;
}

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  const filePath = path.join(CLASSROOMS_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as PersistedClassroomData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
    ownerUserId?: string | null;
  },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  if (!isValidClassroomId(data.id)) {
    throw new Error('Invalid classroom id');
  }
  const classroomData: PersistedClassroomData = {
    id: data.id,
    stage: data.stage,
    scenes: data.scenes,
    createdAt: new Date().toISOString(),
  };

  await ensureClassroomsDir();
  const filePath = path.join(CLASSROOMS_DIR, `${data.id}.json`);
  const ownershipRecord = await findClassroomOwnershipRecord(data.id);
  try {
    await fs.stat(filePath);
    // A file without a database ownership row predates the authenticated
    // storage model. Never let an ordinary save implicitly claim or overwrite
    // it; recovery must be an explicit administrator operation.
    if (ownershipRecord === null) {
      throw new ClassroomOwnershipConflictError(data.id);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  // Claim/verify ownership before touching the file. Otherwise a caller could
  // submit another user's stage id and overwrite the JSON before the DB upsert.
  await upsertClassroomRecord({
    id: data.id,
    ownerUserId: data.ownerUserId,
    title: data.stage.name || 'Untitled Stage',
    storagePath: filePath,
    sceneCount: data.scenes.length,
    createdAt: classroomData.createdAt,
  });
  await writeJsonFileAtomic(filePath, classroomData);

  return {
    ...classroomData,
    url: `${baseUrl}/classroom/${data.id}`,
  };
}
