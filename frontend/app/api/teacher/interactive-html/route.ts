import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { callLLM } from '@/lib/ai/llm';
import {
  readJsonBody,
  rejectCrossOriginRequest,
} from '@/lib/server/request-security';

const log = createLogger('TeacherInteractiveHtml');

const BodySchema = z.object({
  topic: z.string().trim().min(1).max(200),
  goal: z.string().trim().min(1).max(1000),
  interactionType: z.string().trim().min(1).max(200),
  audience: z.string().trim().min(1).max(200),
  constraints: z.string().trim().max(1000).optional(),
});

const SYSTEM_PROMPT = `You are an expert educational front-end engineer. You produce a single self-contained interactive HTML page for teachers to demo in class.

Hard requirements:
- Output ONLY the raw HTML document. Start with "<!DOCTYPE html>" and end with "</html>".
- Do NOT wrap the output in markdown code fences or add any commentary.
- Inline all CSS in a single <style> block and all JS in a single <script> block.
- Do NOT reference any external URLs, CDNs, fonts, images, or scripts. Everything must work offline.
- Use accessible semantic HTML, sensible responsive layout, and clear teacher-facing labels.
- Design the interaction so that a teacher can drive it in front of a class in under 10 minutes.
- Prefer minimal dependencies and readable vanilla JS. No frameworks.`;

const FENCE_RE = /^```(?:html)?\s*([\s\S]*?)\s*```\s*$/i;

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(FENCE_RE);
  return match ? match[1].trim() : trimmed;
}

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const originError = rejectCrossOriginRequest(req);
  if (originError) return originError;

  try {
    const parsedBody = await readJsonBody<unknown>(req);
    if (!parsedBody.ok) return parsedBody.response;
    const raw = parsedBody.value;
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(
        'INVALID_REQUEST',
        400,
        'Invalid request body',
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    const { topic, goal, interactionType, audience, constraints } = parsed.data;

    const resolved = await resolveModelFromRequest(req, raw, 'teacher-interactive-html');

    const prompt = [
      `Topic: ${topic}`,
      `Learning goal: ${goal}`,
      `Interaction type: ${interactionType}`,
      `Audience: ${audience}`,
      constraints ? `Additional constraints: ${constraints}` : null,
      '',
      'Return a single-file HTML document that fulfils the requirements above.',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await callLLM(
      {
        model: resolved.model,
        system: SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: resolved.modelInfo?.outputWindow,
      },
      'teacher-interactive-html',
      { retries: 1, validate: (t) => /<html[\s>]/i.test(t) && /<\/html>/i.test(t) },
      resolved.thinkingConfig,
    );

    const html = stripCodeFences(result.text || '');
    if (!/<html[\s>]/i.test(html)) {
      return apiError(
        'GENERATION_FAILED',
        502,
        'Model did not return a valid HTML document',
      );
    }
    return apiSuccess({ html });
  } catch (error) {
    log.error('interactive-html generation failed:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to generate interactive HTML',
      error instanceof Error ? error.message : String(error),
    );
  }
}
