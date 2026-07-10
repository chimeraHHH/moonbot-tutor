import { createLogger } from '@/lib/logger';
import type { GenerationContext } from './identity';

const log = createLogger('GenerationTrace');

export function traceGeneration(
  context: Partial<GenerationContext> | null | undefined,
  phase: string,
  extra?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (process.env.NODE_ENV === 'production') return;

  log.info('generation', {
    classroomId: context?.classroomId || '-',
    sessionId: context?.sessionId || '-',
    generationId: context?.generationId || '-',
    sceneId: context?.sceneId || '-',
    topic: (context?.topic || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    lessonLanguage: context?.lessonLanguage || '-',
    phase,
    ...extra,
  });
}
