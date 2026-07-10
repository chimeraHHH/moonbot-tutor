import type { Scene } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';

function plainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractPeerSceneContext(scene: Scene): {
  sceneTitle: string;
  slideBody: string;
  teacherNarration: string;
} {
  const slideBody =
    scene.content.type === 'slide'
      ? scene.content.canvas.elements
          .map((element) =>
            element.type === 'text' && 'content' in element ? plainText(element.content) : '',
          )
          .filter(Boolean)
          .join('\n')
          .slice(0, 1600)
      : '';
  const speeches = (scene.actions ?? []).filter(
    (action): action is SpeechAction => action.type === 'speech',
  );
  return {
    sceneTitle: scene.title,
    slideBody,
    teacherNarration: speeches
      .slice(-2)
      .map((action) => action.text)
      .join('\n')
      .slice(0, 1600),
  };
}
