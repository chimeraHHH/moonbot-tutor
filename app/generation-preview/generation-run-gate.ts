import type { GenerationIdentity } from '@/lib/classroom/generation';
import type { SceneOutline } from '@/lib/types/generation';

function generationKey(identity: GenerationIdentity): string {
  return `${identity.classroomId}:${identity.sessionId}:${identity.generationId}`;
}

/** Prevent duplicate generation-preview pipelines for the same generation identity. */
export class GenerationRunGate {
  private activeKey: string | null = null;

  tryStart(identity: GenerationIdentity): boolean {
    const key = generationKey(identity);
    if (this.activeKey === key) return false;
    this.activeKey = key;
    return true;
  }

  finish(identity: GenerationIdentity): void {
    if (this.activeKey === generationKey(identity)) {
      this.activeKey = null;
    }
  }
}

export function buildConfirmedOutlineSession<T extends GenerationIdentity>(
  session: T,
  sceneOutlines: SceneOutline[],
): T & { sceneOutlines: SceneOutline[]; previewPhase: 'generating-content' } {
  return {
    ...session,
    sceneOutlines,
    previewPhase: 'generating-content',
  };
}
