import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { resolveVideoBaseUrl } from '@/lib/server/provider-config';

const log = createLogger('DeepSolveVideoDownload');
const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const maxDuration = 300;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  if (!TASK_ID_PATTERN.test(taskId)) {
    return apiError('INVALID_REQUEST', 400, 'Invalid Deep Solve task id');
  }

  const baseUrl = (resolveVideoBaseUrl('deep-solve') || 'http://localhost:8010').replace(
    /\/+$/,
    '',
  );

  try {
    const upstream = await fetch(
      `${baseUrl}/api/v1/deep-solve/tasks/${encodeURIComponent(taskId)}/video`,
      { cache: 'no-store' },
    );
    if (!upstream.ok || !upstream.body) {
      return apiError(
        'UPSTREAM_ERROR',
        upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502,
        `Deep Solve video download failed (${upstream.status})`,
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('Content-Disposition', `inline; filename="deep-solve-${taskId}.mp4"`);

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('Deep Solve video download failed:', error);
    return apiError('UPSTREAM_ERROR', 503, 'Deep Solve bridge unreachable', message);
  }
}
