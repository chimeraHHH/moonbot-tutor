import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { getCurrentUser, isAuthEnabled } from '@/lib/server/auth';
import { verifyTeacherTaskToken } from '@/lib/server/teacher-task-token';

const log = createLogger('TeacherDeepSolveStatus');

const BRIDGE_DOWN_HINT =
  'Deep Solve gateway is unreachable. Verify the NestJS backend (:8088) and code2video (:8010).';

function getBaseUrl(): string {
  return (process.env.VIDEO_DEEPSOLVE_BASE_URL || 'http://localhost:8088').replace(/\/+$/, '');
}

export const dynamic = 'force-dynamic';

interface DeepSolveStatus {
  taskId: string;
  status: string;
  progress?: number;
  stage?: string | null;
  videoUrl?: string | null;
  error?: string | null;
}

export async function GET(req: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  if (!taskId || !/^[A-Za-z0-9_.-]{1,128}$/.test(taskId)) {
    return apiError('INVALID_REQUEST', 400, 'Invalid taskId');
  }

  const user = await getCurrentUser();
  if (isAuthEnabled() && !user) {
    return apiError('INVALID_REQUEST', 401, 'Authentication required');
  }
  const accessToken = req.nextUrl.searchParams.get('accessToken') || '';
  if (!verifyTeacherTaskToken(accessToken, taskId, user?.id || 'local-development')) {
    return apiError('INVALID_REQUEST', 404, 'Task not found');
  }

  const base = getBaseUrl();
  try {
    const resp = await fetch(`${base}/api/v1/tasks/${taskId}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return apiError(
        'UPSTREAM_ERROR',
        resp.status,
        `Deep Solve status fetch failed (${resp.status})`,
        text || undefined,
      );
    }
    const data = (await resp.json()) as DeepSolveStatus;
    const ready = data.status === 'succeeded';
    // Proxy the video URL through our own route so the bridge origin is never
    // exposed to the browser.
    const videoUrl = ready
      ? `/api/teacher/deep-solve/tasks/${taskId}/video?accessToken=${encodeURIComponent(accessToken)}`
      : undefined;
    const failed = data.status === 'failed' || data.status === 'cancelled';
    return apiSuccess({
      taskId,
      state: data.status,
      progress: typeof data.progress === 'number' ? data.progress : undefined,
      stage: data.stage,
      ready,
      done: ready || failed,
      videoUrl,
      error: failed ? data.error || `Task ${data.status}` : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('deep-solve status fetch error:', err);
    return apiError('UPSTREAM_ERROR', 503, 'Deep Solve bridge unreachable', `${BRIDGE_DOWN_HINT} (${msg})`);
  }
}
