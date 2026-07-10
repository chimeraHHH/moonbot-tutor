import { createLogger } from '@/lib/logger';
import { isDatabaseConfigured, query } from '@/lib/server/db';

const log = createLogger('AdminRecords');

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
    await query(
      `INSERT INTO classrooms (id, owner_user_id, title, storage_path, scene_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE
         SET owner_user_id = COALESCE(EXCLUDED.owner_user_id, classrooms.owner_user_id),
             title = EXCLUDED.title,
             storage_path = EXCLUDED.storage_path,
             scene_count = EXCLUDED.scene_count,
             updated_at = now()`,
      [
        input.id,
        input.ownerUserId ?? null,
        input.title,
        input.storagePath ?? null,
        input.sceneCount,
        input.createdAt,
      ],
    );
  } catch (error) {
    log.warn(`Failed to upsert classroom admin record ${input.id}`, error);
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
