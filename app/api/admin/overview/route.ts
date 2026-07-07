import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getCurrentUser } from '@/lib/server/auth';
import { queryOne } from '@/lib/server/db';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: apiError('INVALID_REQUEST', 401, 'Authentication required') };
  if (user.role !== 'admin')
    return { error: apiError('INVALID_REQUEST', 403, 'Admin role required') };
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const [users, activeSessions, classrooms, generationJobs, failedJobs] = await Promise.all([
    queryOne<{ count: string }>('SELECT count(*)::text FROM users'),
    queryOne<{ count: string }>(
      `SELECT count(*)::text FROM sessions WHERE revoked_at IS NULL AND expires_at > now()`,
    ),
    queryOne<{ count: string }>('SELECT count(*)::text FROM classrooms'),
    queryOne<{ count: string }>('SELECT count(*)::text FROM generation_jobs'),
    queryOne<{ count: string }>(
      `SELECT count(*)::text FROM generation_jobs WHERE status = 'failed'`,
    ),
  ]);
  const [recentClassrooms, recentJobs] = await Promise.all([
    queryOne<{ data: unknown }>(
      `SELECT COALESCE(jsonb_agg(row_to_json(classroom_rows)), '[]'::jsonb) AS data
         FROM (
           SELECT c.id,
                  c.title,
                  c.scene_count AS "sceneCount",
                  c.created_at AS "createdAt",
                  u.email AS "ownerEmail"
             FROM classrooms c
             LEFT JOIN users u ON u.id = c.owner_user_id
            ORDER BY c.created_at DESC
            LIMIT 8
         ) classroom_rows`,
    ),
    queryOne<{ data: unknown }>(
      `SELECT COALESCE(jsonb_agg(row_to_json(job_rows)), '[]'::jsonb) AS data
         FROM (
           SELECT j.id,
                  j.status,
                  j.step,
                  j.progress,
                  j.message,
                  j.error,
                  j.created_at AS "createdAt",
                  j.completed_at AS "completedAt",
                  j.classroom_id AS "classroomId",
                  u.email AS "ownerEmail"
             FROM generation_jobs j
             LEFT JOIN users u ON u.id = j.owner_user_id
            ORDER BY j.created_at DESC
            LIMIT 8
         ) job_rows`,
    ),
  ]);

  return apiSuccess({
    overview: {
      users: Number(users?.count ?? 0),
      activeSessions: Number(activeSessions?.count ?? 0),
      classrooms: Number(classrooms?.count ?? 0),
      generationJobs: Number(generationJobs?.count ?? 0),
      failedJobs: Number(failedJobs?.count ?? 0),
    },
    recentClassrooms: recentClassrooms?.data ?? [],
    recentJobs: recentJobs?.data ?? [],
  });
}
