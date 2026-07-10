import type { PeerMessageContext } from './types';

function bound(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`;
}

export function buildPeerMessagePrompt(context: PeerMessageContext): {
  system: string;
  user: string;
} {
  const replyRule =
    context.kind === 'reply'
      ? `Reply naturally to the first student's message while using the teacher's latest explanation. First student message: "${bound(context.firstMessage ?? '', 300)}"`
      : 'Start a brief peer exchange with a question, a precise confusion, or a useful observation.';

  return {
    system: `You are ${context.agent.name}, a student in a live class. Persona: ${context.agent.personaPrompt}\n${context.lessonLanguage.instruction}\nSpeak for only 1-2 short sentences. Stay strictly within what the teacher just explained. Do not mention future lesson content, invent facts, give a long explanation, or take over the teacher's role. Return only the message text.`,
    user: `Current scene title: ${bound(context.sceneTitle, 160)}\nCurrent slide body: ${bound(context.slideBody, 1200)}\nTeacher's latest narration: ${bound(context.teacherNarration, 1200)}\nTask: ${replyRule}`,
  };
}

export function normalizePeerMessage(value: string): string {
  return value
    .trim()
    .replace(/^['"“”]+|['"“”]+$/g, '')
    .slice(0, 360);
}
