import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { submitDeepSolveTask } from '@/lib/media/adapters/deep-solve-adapter';
import { resolveLessonLanguage } from '@/lib/media/lesson-language';
import { createLogger } from '@/lib/logger';

const log = createLogger('TeacherDeepSolve');

const BRIDGE_DOWN_HINT =
  'Deep Solve bridge is unreachable. Start it with `./services/code2video/start-backend.sh` (defaults to http://localhost:8010) or set VIDEO_DEEPSOLVE_BASE_URL.';

function getBaseUrl(): string {
  return process.env.VIDEO_DEEPSOLVE_BASE_URL || 'http://localhost:8010';
}

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      question?: unknown;
      context?: unknown;
      lessonLanguage?: unknown;
    };
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: question');
    }
    // Map the client's language hint (enum or directive) to the protocol enum
    // at this entry point; absent defaults to Simplified Chinese downstream.
    const lessonLanguage = resolveLessonLanguage(
      typeof body.lessonLanguage === 'string' ? body.lessonLanguage : undefined,
    );
    // NOTE: `context` is accepted from the client but the deep-solve adapter's
    // `VideoGenerationOptions` doesn't carry a context field — the adapter itself
    // sets `input.context = ''`. Concatenating context into the prompt is the
    // minimal way to include it without patching the adapter.
    const context = typeof body.context === 'string' ? body.context.trim() : '';
    const prompt = context ? `${question}\n\n补充上下文:\n${context}` : question;

    const baseUrl = getBaseUrl();
    try {
      const taskId = await submitDeepSolveTask(
        { providerId: 'deep-solve', apiKey: '', baseUrl },
        { prompt, aspectRatio: '16:9', lessonLanguage },
      );
      return apiSuccess({ taskId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isNetwork =
        err instanceof TypeError ||
        /ECONNREFUSED|fetch failed|Failed to fetch|network/i.test(msg);
      log.error('deep-solve submission failed:', err);
      return apiError(
        isNetwork ? 'UPSTREAM_ERROR' : 'GENERATION_FAILED',
        isNetwork ? 503 : 500,
        isNetwork ? 'Deep Solve bridge unreachable' : 'Deep Solve submission failed',
        isNetwork ? BRIDGE_DOWN_HINT : msg,
      );
    }
  } catch (error) {
    log.error('deep-solve route unexpected error:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to submit deep-solve task',
      error instanceof Error ? error.message : String(error),
    );
  }
}
