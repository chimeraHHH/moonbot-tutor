import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { buildPeerMessagePrompt } from '@/lib/classroom/peer-agents';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.agent || !body.sceneTitle || !body.teacherNarration || !body.languageInstruction) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Peer message context is incomplete');
    }
    if (body.kind === 'reply' && !body.firstMessage?.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'A reply requires the first peer message');
    }
    const prompts = buildPeerMessagePrompt(body);
    const { model, thinkingConfig } = await resolveModelFromRequest(req, body, 'chat-adapter');
    const result = await callLLM(
      { model, system: prompts.system, prompt: prompts.user, maxOutputTokens: 160 },
      'peer-student-message',
      undefined,
      thinkingConfig,
    );
    const message = result.text
      .trim()
      .replace(/^['"“”]+|['"“”]+$/g, '')
      .slice(0, 360);
    return message
      ? apiSuccess({ message })
      : apiError('GENERATION_FAILED', 502, 'Peer message was empty');
  } catch {
    return apiError('GENERATION_FAILED', 502, 'Peer message generation failed');
  }
}
