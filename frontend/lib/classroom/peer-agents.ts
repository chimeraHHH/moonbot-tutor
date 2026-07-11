import type { SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';

export interface ClassroomPeerAgent {
  id: string;
  name: string;
  avatar: string;
  color: string;
  personaLabel: string;
  personaPrompt: string;
}

export interface PeerInteractionTrigger {
  sceneOrder: number;
  speakerId: string;
  kind: 'start' | 'reply';
  /** Deterministic pseudo-random position (0..1) within the teacher lecture. */
  interruptAt: number;
  status: 'pending' | 'complete' | 'skipped';
}

export interface PeerAgentClassroomState {
  agents: ClassroomPeerAgent[];
  triggers: PeerInteractionTrigger[];
  hasSpokenAgentIds: string[];
  firstMessage?: string;
}

const PERSONAS = [
  [
    'curious',
    'Mina',
    '/avatars/curious.png',
    '#2563eb',
    '好奇追问型',
    'Ask a concise why or edge-case question.',
  ],
  [
    'skeptical',
    'Alex',
    '/avatars/thinker.png',
    '#7c3aed',
    '谨慎质疑型',
    'Check one assumption or condition carefully.',
  ],
  [
    'summarizer',
    'Noah',
    '/avatars/note-taker.png',
    '#059669',
    '总结归纳型',
    'Restate the key relationship accurately and briefly.',
  ],
  [
    'confused',
    'Iris',
    '/avatars/clown-2.png',
    '#dc2626',
    '易混淆型',
    'Voice one plausible common confusion.',
  ],
  [
    'analogy',
    'Leo',
    '/avatars/curious-2.png',
    '#d97706',
    '生活类比型',
    'Offer a simple accurate everyday analogy.',
  ],
  [
    'focus',
    'Sora',
    '/avatars/note-taker-2.png',
    '#0891b2',
    '重点关注型',
    'Ask which distinction matters most.',
  ],
] as const;

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function shuffle<T>(values: readonly T[], seed: string): T[] {
  const result = [...values];
  let state = hash(seed) || 1;
  for (let index = result.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = Math.floor((state / 0x100000000) * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function assignPeerPersonas(classroomId: string): ClassroomPeerAgent[] {
  return shuffle(PERSONAS, classroomId)
    .slice(0, 3)
    .map(([persona, name, avatar, color, personaLabel, personaPrompt]) => ({
      id: `peer-${persona}-${hash(classroomId).toString(36)}`,
      name,
      avatar,
      color,
      personaLabel,
      personaPrompt,
    }));
}

const EXCLUDED_TITLE =
  /^(introduction|intro|overview|welcome|conclusion|summary|recap|opening|closing|引言|导言|课程概览|欢迎|总结|小结|回顾|结语)$/i;

export function selectInteractionOrders(
  outlines: SceneOutline[],
  seed = 'peer-interactions',
): number[] {
  const eligible = outlines.filter(
    (outline) =>
      outline.type === 'slide' &&
      !EXCLUDED_TITLE.test(outline.title.trim()) &&
      outline.keyPoints.length > 0,
  );
  if (eligible.length === 0) return [];
  const picked = shuffle(eligible, `${seed}:scenes`).slice(0, Math.min(2, eligible.length));
  return picked.map((outline) => outline.order).sort((a, b) => a - b);
}

export function createPeerAgentClassroomState(
  classroomId: string,
  outlines: SceneOutline[],
): PeerAgentClassroomState {
  const agents = assignPeerPersonas(classroomId);
  const speakers = shuffle(agents, `${classroomId}:speakers`).slice(0, 2);
  return {
    agents,
    triggers: selectInteractionOrders(outlines, classroomId)
      .slice(0, speakers.length)
      .map((sceneOrder, index) => ({
        sceneOrder,
        speakerId: speakers[index].id,
        kind: index === 0 ? 'start' : 'reply',
        interruptAt:
          0.2 + (hash(`${classroomId}:interrupt:${sceneOrder}:${index}`) / 0x100000000) * 0.6,
        status: 'pending',
      })),
    hasSpokenAgentIds: [],
  };
}

/**
 * Maps a persisted lecture-relative position to a concrete speech action and a
 * progress point inside it. This lets even a one-speech fallback scene be
 * interrupted while the teacher is still talking.
 */
export function resolvePeerSpeechCheckpoint(
  trigger: PeerInteractionTrigger,
  speechCount: number,
): { speechNumber: number; progress: number } | null {
  if (speechCount <= 0) return null;
  const interruptAt = Number.isFinite(trigger.interruptAt) ? trigger.interruptAt : 0.5;
  const scaled = Math.min(0.999, Math.max(0, interruptAt)) * speechCount;
  return {
    speechNumber: Math.min(speechCount, Math.floor(scaled) + 1),
    progress: Math.min(0.75, Math.max(0.3, scaled - Math.floor(scaled))),
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

function plainText(value: unknown): string {
  return typeof value === 'string'
    ? value
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

export function extractPeerSceneContext(scene: Scene, currentTeacherNarration?: string) {
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
    teacherNarration:
      currentTeacherNarration?.trim().slice(0, 1600) ||
      speeches
        .slice(-2)
        .map((action) => action.text)
        .join('\n')
        .slice(0, 1600),
  };
}

export function buildPeerMessagePrompt(input: {
  sceneTitle: string;
  slideBody: string;
  teacherNarration: string;
  firstMessage?: string;
  agent: ClassroomPeerAgent;
  kind: 'start' | 'reply';
  languageInstruction: string;
}) {
  const reply =
    input.kind === 'reply'
      ? `Reply naturally to this first student message: "${input.firstMessage?.slice(0, 300)}".`
      : 'Ask a brief, natural question or voice one precise confusion about what the teacher is explaining right now.';
  return {
    system: `You are ${input.agent.name}, a student in a live class. Persona: ${input.agent.personaPrompt}\n${input.languageInstruction}\nSpeak for only 1-2 short sentences. Stay strictly within the teacher's latest explanation. Never take over the teacher's role. Return only the message text.`,
    user: `Scene: ${input.sceneTitle.slice(0, 160)}\nSlide: ${input.slideBody.slice(0, 1200)}\nTeacher: ${input.teacherNarration.slice(0, 1200)}\nTask: ${reply}`,
  };
}
