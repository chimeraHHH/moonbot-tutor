import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import {
  buildPeerMessagePrompt,
  normalizePeerMessage,
  type PeerMessageContext,
} from '@/lib/classroom/peer-agents';
import { coerceLessonLanguage } from '@/lib/classroom/language';

const log = createLogger('PeerMessageAPI');

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PeerMessageContext;
    if (!body.agent || !body.sceneTitle || !body.teacherNarration || !body.lessonLanguage) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Peer message context is incomplete');
    }
    if (body.kind === 'reply' && !body.firstMessage?.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'A reply requires the first peer message');
    }

    const context: PeerMessageContext = {
      ...body,
      lessonLanguage: coerceLessonLanguage(body.lessonLanguage),
    };
    const prompts = buildPeerMessagePrompt(context);
    const { model, thinkingConfig } = await resolveModelFromRequest(req, body, 'chat-adapter');
    const result = await callLLM(
      {
        model,
        system: prompts.system,
        prompt: prompts.user,
        maxOutputTokens: 160,
      },
      'peer-student-message',
      undefined,
      thinkingConfig,
    );
    const message = normalizePeerMessage(result.text);
    if (!message) return apiError('GENERATION_FAILED', 502, 'Peer message was empty');
    return apiSuccess({ message });
  } catch (error) {
    log.warn('Peer message generation failed; classroom playback will continue', error);
    return apiError('GENERATION_FAILED', 502, 'Peer message generation failed');
  }
}
