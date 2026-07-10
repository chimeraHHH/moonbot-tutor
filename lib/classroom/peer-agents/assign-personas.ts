import { PEER_PERSONAS } from './personas';
import type { ClassroomPeerAgent, PeerPersonaDefinition } from './types';

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(items: readonly T[], seedText: string): T[] {
  const result = [...items];
  let state = hashSeed(seedText) || 1;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function toClassroomAgent(
  definition: PeerPersonaDefinition,
  classroomId: string,
  locale: string,
): ClassroomPeerAgent {
  return {
    id: `peer-${definition.id}-${hashSeed(classroomId).toString(36)}`,
    personaId: definition.id,
    name: definition.name,
    avatar: definition.avatar,
    color: definition.color,
    personaLabel: locale.startsWith('zh') ? definition.labelZh : definition.labelEn,
    personaPrompt: definition.prompt,
  };
}

export function assignPeerPersonas(classroomId: string, locale: string): ClassroomPeerAgent[] {
  return seededShuffle(PEER_PERSONAS, classroomId)
    .slice(0, 3)
    .map((definition) => toClassroomAgent(definition, classroomId, locale));
}

export function selectPeerSpeakers(agents: ClassroomPeerAgent[], classroomId: string): string[] {
  return seededShuffle(agents, `${classroomId}:speakers`)
    .slice(0, Math.min(2, agents.length))
    .map((agent) => agent.id);
}
