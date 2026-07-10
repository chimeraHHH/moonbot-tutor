/**
 * Scene Actions Generation API
 *
 * Generates actions for a scene given its outline and content,
 * then assembles the complete Scene object.
 * This is the second half of the two-step scene generation pipeline.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  generateSceneActions,
  buildCompleteScene,
  buildVisionUserContent,
  type SceneGenerationContext,
  type AgentInfo,
} from '@/lib/generation/generation-pipeline';
import type { SceneOutline } from '@/lib/types/generation';
import type {
  GeneratedSlideContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
} from '@/lib/types/generation';
import type { SpeechAction } from '@/lib/types/action';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { llmApiError } from '@/lib/server/llm-error-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { coerceLessonLanguage } from '@/lib/classroom/language';
import type { LessonLanguage } from '@/lib/classroom/language';
import {
  isGenerationContextValid,
  traceGeneration,
  type GenerationContext,
} from '@/lib/classroom/generation';

const log = createLogger('Scene Actions API');

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let outlineTitle: string | undefined;
  let resolvedModelString: string | undefined;
  try {
    const body = await req.json();
    const {
      outline,
      allOutlines,
      content,
      stageId,
      agents,
      previousSpeeches: incomingPreviousSpeeches,
      userProfile,
      languageDirective,
      lessonLanguage: incomingLessonLanguage,
      generationContext,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      content:
        | GeneratedSlideContent
        | GeneratedQuizContent
        | GeneratedInteractiveContent
        | GeneratedPBLContent;
      stageId: string;
      agents?: AgentInfo[];
      previousSpeeches?: string[];
      userProfile?: string;
      languageDirective?: string;
      lessonLanguage?: LessonLanguage;
      generationContext?: GenerationContext;
    };
    const lessonLanguage = incomingLessonLanguage
      ? coerceLessonLanguage(incomingLessonLanguage)
      : undefined;
    const effectiveLanguageDirective = lessonLanguage?.instruction || languageDirective;

    // Validate required fields
    if (!outline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!content) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'content is required');
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }
    if (
      generationContext &&
      !isGenerationContextValid(generationContext, {
        classroomId: stageId,
        sceneId: outline.id,
      })
    ) {
      return apiError('INVALID_REQUEST', 409, 'Stale or mismatched scene-actions request');
    }
    traceGeneration(generationContext, 'scene-actions.request');

    // ── Model resolution from request headers/body ──
    const {
      model: languageModel,
      modelInfo,
      modelString,
      thinkingConfig,
    } = await resolveModelFromRequest(req, body, 'scene-actions');
    outlineTitle = outline?.title;
    resolvedModelString = modelString;

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // AI call function (actions typically don't use vision, but kept for consistency)
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      if (images?.length && hasVision) {
        const result = await callLLM(
          {
            model: languageModel,
            system: systemPrompt,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(userPrompt, images),
              },
            ],
            maxOutputTokens: modelInfo?.outputWindow,
            maxRetries: 0,
          },
          'scene-actions',
          undefined,
          thinkingConfig,
        );
        return result.text;
      }
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: modelInfo?.outputWindow,
          maxRetries: 0,
        },
        'scene-actions',
        undefined,
        thinkingConfig,
      );
      return result.text;
    };

    // ── Build cross-scene context ──
    const allTitles = allOutlines.map((o) => o.title);
    const pageIndex = allOutlines.findIndex((o) => o.id === outline.id);
    const ctx: SceneGenerationContext = {
      pageIndex: (pageIndex >= 0 ? pageIndex : 0) + 1,
      totalPages: allOutlines.length,
      allTitles,
      previousSpeeches: incomingPreviousSpeeches ?? [],
    };

    // ── Generate actions ──
    log.info(`Generating scene actions [type=${outline.type}, model=${modelString}]`);

    const generatedActions = await generateSceneActions(outline, content, aiCall, {
      ctx,
      agents,
      userProfile,
      languageDirective: effectiveLanguageDirective,
    });
    // New classrooms use the deterministic two-message peer schedule. Remove
    // legacy proactive discussion actions so a course cannot exceed that cap.
    const actions = incomingLessonLanguage
      ? generatedActions.filter((action) => action.type !== 'discussion')
      : generatedActions;

    log.info(`Generated ${actions.length} scene actions [type=${outline.type}]`);

    // ── Build complete scene ──
    const scene = buildCompleteScene(outline, content, actions, stageId);

    if (!scene) {
      log.error(`Failed to build scene [type=${outline.type}]`);

      return apiError('GENERATION_FAILED', 500, `Failed to build scene: ${outline.title}`);
    }
    scene.generationId = generationContext?.generationId;
    scene.sessionId = generationContext?.sessionId;

    // ── Extract speeches for cross-scene coherence ──
    const outputPreviousSpeeches = (scene.actions || [])
      .filter((a): a is SpeechAction => a.type === 'speech')
      .map((a) => a.text);

    log.info(`Scene assembled successfully [actions=${scene.actions?.length ?? 0}]`);

    traceGeneration(generationContext, 'scene-actions.complete', { actionCount: actions.length });
    return apiSuccess({ scene, previousSpeeches: outputPreviousSpeeches, generationContext });
  } catch (error) {
    log.error(
      `Scene actions generation failed [hasScene=${Boolean(outlineTitle)}, model=${resolvedModelString ?? 'unknown'}]:`,
      error,
    );
    return llmApiError(error);
  }
}
