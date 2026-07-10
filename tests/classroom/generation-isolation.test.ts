import { describe, expect, it } from 'vitest';
import {
  derivePendingPlaybackState,
  generationParamsStorageKey,
  isSameGeneration,
  persistGenerationSessionIfCurrent,
  replaceGenerationSession,
  type GenerationIdentity,
  type StorageLike,
} from '@/lib/classroom/generation';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

function identity(suffix: string): GenerationIdentity {
  return {
    classroomId: `classroom-${suffix}`,
    sessionId: `session-${suffix}`,
    generationId: `generation-${suffix}`,
  };
}

describe('classroom generation isolation', () => {
  it('keeps projectile-motion and Chang\'e sessions in distinct classrooms', () => {
    const storage = new MemoryStorage();
    const projectile = identity('projectile');
    const change = identity('change');

    replaceGenerationSession(storage, projectile);
    replaceGenerationSession(storage, change);

    expect(isSameGeneration(projectile, change)).toBe(false);
    expect(generationParamsStorageKey(projectile.classroomId)).not.toBe(
      generationParamsStorageKey(change.classroomId),
    );
  });

  it('drops an old delayed session write after a new generation starts', () => {
    const storage = new MemoryStorage();
    const oldGeneration = identity('old');
    const currentGeneration = identity('current');

    replaceGenerationSession(storage, oldGeneration);
    replaceGenerationSession(storage, currentGeneration);

    expect(persistGenerationSessionIfCurrent(storage, oldGeneration)).toBe(false);
    expect(persistGenerationSessionIfCurrent(storage, currentGeneration)).toBe(true);
  });

  it('shows an explicit failed pending page after one slide succeeds and later slides fail', () => {
    const state = derivePendingPlaybackState({
      outlines: [
        { id: 'one', order: 1 },
        { id: 'two', order: 2 },
      ],
      scenes: [{ id: 'scene-one', order: 1 }],
      generatingOutlines: [{ id: 'two', order: 2 }],
      failedOutlineIds: ['two'],
      generationComplete: false,
    });

    expect(state).toEqual({
      isCourseComplete: false,
      isGenerationFailed: true,
      canAdvanceToPendingSlot: true,
    });
  });

  it('preserves the current classroom identity across a refresh restore', () => {
    const storage = new MemoryStorage();
    const current = identity('change');
    replaceGenerationSession(storage, current);

    const restored = JSON.parse(storage.getItem('generationSession')!) as GenerationIdentity;
    expect(isSameGeneration(restored, current)).toBe(true);
    expect(restored.classroomId).toBe('classroom-change');
  });
});
