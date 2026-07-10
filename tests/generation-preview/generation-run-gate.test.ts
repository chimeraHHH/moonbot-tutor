import { describe, expect, it } from 'vitest';
import {
  buildConfirmedOutlineSession,
  GenerationRunGate,
} from '@/app/generation-preview/generation-run-gate';

const firstGeneration = {
  classroomId: 'classroom-1',
  sessionId: 'session-1',
  generationId: 'generation-1',
};

describe('generation preview run gate', () => {
  it('allows only one active run for the same generation', () => {
    const gate = new GenerationRunGate();

    expect(gate.tryStart(firstGeneration)).toBe(true);
    expect(gate.tryStart(firstGeneration)).toBe(false);

    gate.finish(firstGeneration);
    expect(gate.tryStart(firstGeneration)).toBe(true);
  });

  it('does not let an old generation finish unlock a newer run', () => {
    const gate = new GenerationRunGate();
    const nextGeneration = { ...firstGeneration, generationId: 'generation-2' };

    expect(gate.tryStart(firstGeneration)).toBe(true);
    expect(gate.tryStart(nextGeneration)).toBe(true);
    gate.finish(firstGeneration);

    expect(gate.tryStart(nextGeneration)).toBe(false);
  });

  it('commits the generating-content phase without changing identity', () => {
    const outlines = [
      {
        id: 'scene-1',
        type: 'slide' as const,
        title: '祝融的故事',
        description: '介绍故事背景',
        keyPoints: ['祝融'],
        order: 1,
      },
    ];
    const session = {
      ...firstGeneration,
      previewPhase: 'review',
      sceneOutlines: [] as typeof outlines,
    };

    expect(buildConfirmedOutlineSession(session, outlines)).toEqual({
      ...session,
      previewPhase: 'generating-content',
      sceneOutlines: outlines,
    });
  });
});
