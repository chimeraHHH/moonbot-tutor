import type { SceneOutline } from '@/lib/types/generation';
import type { NarrativeVideoContext } from '@/lib/media/types';

interface CourseNarrativeContext {
  title?: string;
  description?: string;
  targetLanguage?: string;
  languageDirective?: string;
}

export function buildNarrativeVideoContext(
  outline: SceneOutline,
  course: CourseNarrativeContext = {},
): NarrativeVideoContext {
  return {
    pageTitle: outline.title,
    teachingNote: outline.description,
    keyPoints: [...(outline.keyPoints || [])],
    ...(outline.teachingObjective ? { teachingObjective: outline.teachingObjective } : {}),
    ...(course.title ? { courseTitle: course.title } : {}),
    ...(course.description ? { courseDescription: course.description } : {}),
    targetLanguage: course.targetLanguage || 'zh-CN',
    ...(course.languageDirective || outline.languageNote
      ? { languageDirective: course.languageDirective || outline.languageNote }
      : {}),
  };
}
