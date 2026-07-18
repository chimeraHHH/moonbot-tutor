import { type NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { getCurrentUser, isAuthEnabled } from '@/lib/server/auth';
import { verifyTeacherTaskToken } from '@/lib/server/teacher-task-token';

const log = createLogger('TeacherDeepSolveVideo');

function getBaseUrl(): string {
  return (process.env.VIDEO_DEEPSOLVE_BASE_URL || 'http://localhost:8088').replace(/\/+$/, '');
}

export const dynamic = 'force-dynamic';

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
    const upstream = await fetch(`${base}/api/v1/tasks/${taskId}/video`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return apiError(
        'UPSTREAM_ERROR',
        upstream.status || 502,
        'Deep Solve video download failed',
        text || undefined,
      );
    }
    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
    const len = upstream.headers.get('content-length');
    if (len) headers.set('Content-Length', len);
    // Inline so the <video> element can play it directly.
    headers.set('Content-Disposition', `inline; filename="deep-solve-${taskId}.mp4"`);
    headers.set('Cache-Control', 'private, max-age=300');
    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('deep-solve video pipe error:', err);
    return apiError('UPSTREAM_ERROR', 503, 'Deep Solve bridge unreachable', msg);
  }
}
