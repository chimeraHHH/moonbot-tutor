import type { SceneOutline, UserRequirements } from '@/lib/types/generation';

/**
 * Competition build: generated courseware is intentionally limited to static
 * PPT-style slides. Keep the interaction implementation in the repository so
 * it can be restored later, but do not expose or generate quiz / interactive /
 * PBL scenes in the active student flow.
 */
export const STATIC_PRESENTATION_SYSTEM_INSTRUCTION = `# Static presentation mode
Generate only ordinary presentation slides.
- Every outline must use type "slide".
- Do not generate quiz, interactive, PBL, simulation, game, coding, or role-play scenes.
- Explain concepts with static text, diagrams, images, and video inside normal slides.`;

export function withoutPresentationInteractions(requirements: UserRequirements): UserRequirements {
  const normalized = { ...requirements };
  delete normalized.interactiveMode;
  delete normalized.taskEngineMode;
  return normalized;
}

export function toStaticSlideOutline(outline: SceneOutline): SceneOutline {
  const normalized: SceneOutline = { ...outline, type: 'slide' };
  delete normalized.quizConfig;
  delete normalized.interactiveConfig;
  delete normalized.pblConfig;
  delete normalized.widgetType;
  delete normalized.widgetOutline;
  return normalized;
}
