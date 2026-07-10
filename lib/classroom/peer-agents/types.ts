import type { LessonLanguage } from '@/lib/classroom/language';

export type PeerPersonaId =
  | 'curious'
  | 'skeptical'
  | 'summarizer'
  | 'confused'
  | 'analogy'
  | 'exam-focused';

export interface PeerPersonaDefinition {
  id: PeerPersonaId;
  name: string;
  avatar: string;
  color: string;
  labelZh: string;
  labelEn: string;
  prompt: string;
}

export interface ClassroomPeerAgent {
  id: string;
  personaId: PeerPersonaId;
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
  status: 'pending' | 'complete' | 'skipped';
}

export interface PeerAgentClassroomState {
  agents: ClassroomPeerAgent[];
  speakerIds: string[];
  triggers: PeerInteractionTrigger[];
  hasSpokenAgentIds: string[];
  firstMessage?: string;
}

export interface PeerMessageContext {
  sceneTitle: string;
  slideBody: string;
  teacherNarration: string;
  firstMessage?: string;
  agent: ClassroomPeerAgent;
  kind: 'start' | 'reply';
  lessonLanguage: LessonLanguage;
}
