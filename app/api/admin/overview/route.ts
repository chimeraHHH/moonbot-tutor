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

  return apiSuccess({
    overview: {
      users: Number(users?.count ?? 0),
      activeSessions: Number(activeSessions?.count ?? 0),
      classrooms: Number(classrooms?.count ?? 0),
      generationJobs: Number(generationJobs?.count ?? 0),
      failedJobs: Number(failedJobs?.count ?? 0),
    },
  });
}
