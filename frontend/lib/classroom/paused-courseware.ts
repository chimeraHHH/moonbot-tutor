import type { SceneOutline } from '@/lib/types/generation';

/**
 * Interactive, PBL and vocational courseware are temporarily paused.
 * Keep the implementations in the repository; this single policy protects
 * every active generation and playback entry point until they are restored.
 */
export const PAUSED_COURSEWARE_INSTRUCTION = `# Courseware feature policy
- Generate only ordinary static "slide" scenes and "quiz" scenes.
- Never generate "interactive" or "pbl" scenes.
- Do not generate simulations, manipulable 3D models, games, code playgrounds, role-play projects, procedural-skill widgets, or vocational task-engine content.
- Explain the same concepts with static slides or ordinary quizzes.`;

export const COURSEWARE_FEATURES_ENABLED = false;

export function pauseCoursewareOutline(outline: SceneOutline): SceneOutline {
  if (outline.type !== 'interactive' && outline.type !== 'pbl') return outline;

  const paused: SceneOutline = {
    ...outline,
    type: 'slide',
    description: outline.description
      ? `${outline.description} Present this as a static, non-interactive visual explanation.`
      : 'Present this concept as a static, non-interactive visual explanation.',
  };

  delete paused.widgetType;
  delete paused.widgetOutline;
  delete paused.interactiveConfig;
  delete paused.pblConfig;
  return paused;
}

export function pauseCoursewareOutlines(outlines: SceneOutline[]): SceneOutline[] {
  return outlines.map(pauseCoursewareOutline);
}
