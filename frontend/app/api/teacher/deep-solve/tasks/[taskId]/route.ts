import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('TeacherDeepSolveStatus');

const BRIDGE_DOWN_HINT =
  'Deep Solve bridge is unreachable. Start it with `./services/code2video/start-backend.sh`.';

function getBaseUrl(): string {
  return (process.env.VIDEO_DEEPSOLVE_BASE_URL || 'http://localhost:8010').replace(/\/+$/, '');
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

export async function GET(_req: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  if (!taskId || !/^[A-Za-z0-9_.-]+$/.test(taskId)) {
    return apiError('INVALID_REQUEST', 400, 'Invalid taskId');
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
    const videoUrl = ready ? `/api/teacher/deep-solve/tasks/${taskId}/video` : undefined;
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
