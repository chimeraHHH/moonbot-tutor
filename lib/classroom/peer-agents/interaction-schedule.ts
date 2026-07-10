import type { SceneOutline } from '@/lib/types/generation';
import type { PeerAgentClassroomState, PeerInteractionTrigger, ClassroomPeerAgent } from './types';
import { assignPeerPersonas, selectPeerSpeakers } from './assign-personas';

const EXCLUDED_TITLE =
  /^(introduction|intro|overview|welcome|conclusion|summary|recap|transition|opening|closing|引言|导言|课程概览|欢迎|总结|小结|回顾|结语|过渡)$/i;

export function selectInteractionOrders(outlines: SceneOutline[]): number[] {
  const eligible = outlines.filter(
    (outline) =>
      outline.type === 'slide' &&
      !EXCLUDED_TITLE.test(outline.title.trim()) &&
      outline.keyPoints.length > 0,
  );
  if (eligible.length < 2) return eligible.length === 1 ? [eligible[0].order] : [];

  const midpoint = Math.ceil(outlines.length / 2);
  const firstPool = eligible.filter((outline) => outline.order <= midpoint);
  const first = firstPool[Math.floor((firstPool.length - 1) / 2)] ?? eligible[0];
  const secondPool = eligible.filter((outline) => outline.order >= first.order + 2);
  if (secondPool.length === 0) return [first.order];
  const second = secondPool[Math.floor(secondPool.length / 2)];
  return [first.order, second.order];
}

export function buildInteractionSchedule(
  outlines: SceneOutline[],
  speakers: ClassroomPeerAgent[],
): PeerInteractionTrigger[] {
  return selectInteractionOrders(outlines)
    .slice(0, Math.min(2, speakers.length))
    .map((sceneOrder, index) => ({
      sceneOrder,
      speakerId: speakers[index].id,
      kind: index === 0 ? 'start' : 'reply',
      status: 'pending',
    }));
}

export function createPeerAgentClassroomState(
  classroomId: string,
  outlines: SceneOutline[],
  locale: string,
): PeerAgentClassroomState {
  const agents = assignPeerPersonas(classroomId, locale);
  const speakerIds = selectPeerSpeakers(agents, classroomId);
  const speakers = speakerIds
    .map((id) => agents.find((agent) => agent.id === id))
    .filter((agent): agent is ClassroomPeerAgent => agent != null);
  return {
    agents,
    speakerIds,
    triggers: buildInteractionSchedule(outlines, speakers),
    hasSpokenAgentIds: [],
  };
}

export function canTriggerPeerMessage(
  state: PeerAgentClassroomState,
  sceneOrder: number,
): PeerInteractionTrigger | null {
  if (state.hasSpokenAgentIds.length >= 2) return null;
  const trigger = state.triggers.find(
    (item) => item.sceneOrder === sceneOrder && item.status === 'pending',
  );
  if (!trigger || state.hasSpokenAgentIds.includes(trigger.speakerId)) return null;
  if (trigger.kind === 'reply' && !state.firstMessage) return null;
  return trigger;
}
