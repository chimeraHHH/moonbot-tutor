import { describe, expect, it } from 'vitest';
import {
  assignPeerPersonas,
  canTriggerPeerMessage,
  createPeerAgentClassroomState,
  resolvePeerSpeechCheckpoint,
  selectInteractionOrders,
} from '@/lib/classroom/peer-agents';
import type { SceneOutline } from '@/lib/types/generation';

const outline = (order: number, type: SceneOutline['type'] = 'slide'): SceneOutline => ({
  id: `o-${order}`,
  order,
  type,
  title: `Topic ${order}`,
  description: '',
  keyPoints: [`Point ${order}`],
});

describe('bounded peer agents', () => {
  it('assigns three deterministic distinct students', () => {
    const agents = assignPeerPersonas('classroom-42');
    expect(assignPeerPersonas('classroom-42')).toEqual(agents);
    expect(agents).toHaveLength(3);
    expect(new Set(agents.map((agent) => agent.id)).size).toBe(3);
  });

  it('schedules at most two different speakers on slide scenes only', () => {
    expect(
      selectInteractionOrders([outline(1, 'quiz'), outline(2, 'interactive'), outline(3)]),
    ).toEqual([3]);
    const state = createPeerAgentClassroomState('classroom-42', [
      outline(1),
      outline(2),
      outline(3),
      outline(4),
    ]);
    expect(state.triggers.length).toBeLessThanOrEqual(2);
    expect(new Set(state.triggers.map((item) => item.speakerId)).size).toBe(state.triggers.length);
  });

  it('places a question inside a teacher speech, including a one-speech scene', () => {
    const state = createPeerAgentClassroomState('classroom-42', [outline(1), outline(2)]);
    const trigger = state.triggers[0];
    const single = resolvePeerSpeechCheckpoint(trigger, 1);
    expect(single?.speechNumber).toBe(1);
    expect(single?.progress).toBeGreaterThanOrEqual(0.3);
    expect(single?.progress).toBeLessThanOrEqual(0.75);

    const multiple = resolvePeerSpeechCheckpoint(trigger, 4);
    expect(multiple?.speechNumber).toBeGreaterThanOrEqual(1);
    expect(multiple?.speechNumber).toBeLessThanOrEqual(4);
  });

  it('does not repeat a completed speaker after refresh', () => {
    const state = createPeerAgentClassroomState('classroom-42', [outline(1), outline(2)]);
    const trigger = state.triggers[0];
    expect(
      canTriggerPeerMessage(
        { ...state, hasSpokenAgentIds: [trigger.speakerId] },
        trigger.sceneOrder,
      ),
    ).toBeNull();
  });
});
