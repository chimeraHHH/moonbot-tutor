import { describe, expect, it } from 'vitest';
import { createLessonLanguage } from '@/lib/classroom/language';
import {
  assignPeerPersonas,
  buildPeerMessagePrompt,
  canTriggerPeerMessage,
  createPeerAgentClassroomState,
  selectInteractionOrders,
} from '@/lib/classroom/peer-agents';
import type { SceneOutline } from '@/lib/types/generation';

function outline(order: number, title = `Topic ${order}`): SceneOutline {
  return {
    id: `outline-${order}`,
    order,
    type: 'slide',
    title,
    description: `Explain topic ${order}`,
    keyPoints: [`Point ${order}`],
  };
}

describe('peer agent assignment and schedule', () => {
  it('assigns the same three distinct personas for the same classroom', () => {
    const first = assignPeerPersonas('classroom-42', 'zh-CN');
    const second = assignPeerPersonas('classroom-42', 'zh-CN');
    expect(second).toEqual(first);
    expect(first).toHaveLength(3);
    expect(new Set(first.map((agent) => agent.personaId)).size).toBe(3);
  });

  it('schedules at most two messages with different speakers', () => {
    const state = createPeerAgentClassroomState(
      'classroom-42',
      [outline(1, 'Introduction'), outline(2), outline(3), outline(4), outline(5)],
      'en-US',
    );
    expect(state.triggers.length).toBeLessThanOrEqual(2);
    expect(new Set(state.triggers.map((trigger) => trigger.speakerId)).size).toBe(
      state.triggers.length,
    );
  });

  it('never lets the same agent speak twice', () => {
    const state = createPeerAgentClassroomState(
      'classroom-repeat',
      [outline(1), outline(2), outline(3), outline(4)],
      'en-US',
    );
    const first = state.triggers[0];
    expect(first).toBeDefined();
    const mutated = { ...state, hasSpokenAgentIds: [first.speakerId] };
    expect(canTriggerPeerMessage(mutated, first.sceneOrder)).toBeNull();
  });

  it('includes the first message only as bounded context for the reply', () => {
    const agent = assignPeerPersonas('classroom-context', 'zh-CN')[0];
    const firstMessage = '如果只缺少循环等待，是不是就不会死锁？';
    const prompt = buildPeerMessagePrompt({
      sceneTitle: '死锁条件',
      slideBody: '四个必要条件',
      teacherNarration: '四个条件必须同时成立。',
      firstMessage,
      agent,
      kind: 'reply',
      lessonLanguage: createLessonLanguage('zh-CN'),
    });
    expect(prompt.user).toContain(firstMessage);
    expect(prompt.user).toContain('四个条件必须同时成立');
  });

  it('degrades safely for a very short course', () => {
    expect(selectInteractionOrders([])).toEqual([]);
    expect(selectInteractionOrders([outline(1, 'Introduction')])).toEqual([]);
    expect(selectInteractionOrders([outline(1)])).toEqual([1]);
  });
});
