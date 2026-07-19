import { createLogger } from '@/lib/logger';
import { isDatabaseConfigured, query } from '@/lib/server/db';

const log = createLogger('AdminRecords');

export class ClassroomOwnershipConflictError extends Error {
  constructor(classroomId: string) {
    super(`Classroom id is already owned by another user: ${classroomId}`);
    this.name = 'ClassroomOwnershipConflictError';
  }
}

export interface ClassroomOwnershipRecord {
  id: string;
  ownerUserId: string | null;
}

/**
 * Returns undefined when persistence is intentionally disabled, null when no
 * row exists, and the ownership row otherwise. Keeping those states distinct
 * lets the filesystem layer fail closed for pre-authentication legacy files
 * without breaking database-free local development.
 */
export async function findClassroomOwnershipRecord(
  classroomId: string,
): Promise<ClassroomOwnershipRecord | null | undefined> {
  if (!isDatabaseConfigured()) return undefined;

  const rows = await query<ClassroomOwnershipRecord>(
    `SELECT id, owner_user_id AS "ownerUserId"
       FROM classrooms
      WHERE id = $1
      LIMIT 1`,
    [classroomId],
  );
  return rows[0] ?? null;
}

export async function upsertClassroomRecord(input: {
  id: string;
  ownerUserId?: string | null;
  title: string;
  storagePath?: string | null;
  sceneCount: number;
  createdAt: string;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;

  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO classrooms (id, owner_user_id, title, storage_path, scene_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title,
             storage_path = EXCLUDED.storage_path,
             scene_count = EXCLUDED.scene_count,
             updated_at = now()
       WHERE classrooms.owner_user_id IS NOT DISTINCT FROM EXCLUDED.owner_user_id
       RETURNING id`,
      [
        input.id,
        input.ownerUserId ?? null,
        input.title,
        input.storagePath ?? null,
        input.sceneCount,
        input.createdAt,
      ],
    );
    if (rows.length === 0) throw new ClassroomOwnershipConflictError(input.id);
  } catch (error) {
    log.warn(`Failed to upsert classroom admin record ${input.id}`, error);
    throw error;
  }
}

export async function upsertGenerationJobRecord(input: {
  id: string;
  ownerUserId?: string | null;
  classroomId?: string | null;
  status: string;
  step?: string | null;
  progress: number;
  message?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;

  try {
    await query(
      `INSERT INTO generation_jobs (
         id, owner_user_id, classroom_id, status, step, progress, message, error,
         created_at, updated_at, completed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE
         SET owner_user_id = COALESCE(EXCLUDED.owner_user_id, generation_jobs.owner_user_id),
             classroom_id = COALESCE(EXCLUDED.classroom_id, generation_jobs.classroom_id),
             status = EXCLUDED.status,
             step = EXCLUDED.step,
             progress = EXCLUDED.progress,
             message = EXCLUDED.message,
             error = EXCLUDED.error,
             updated_at = EXCLUDED.updated_at,
             completed_at = EXCLUDED.completed_at`,
      [
        input.id,
        input.ownerUserId ?? null,
        input.classroomId ?? null,
        input.status,
        input.step ?? null,
        input.progress,
        input.message ?? null,
        input.error ?? null,
        input.createdAt,
        input.updatedAt,
        input.completedAt ?? null,
      ],
    );
  } catch (error) {
    log.warn(`Failed to upsert generation job admin record ${input.id}`, error);
  }
}
