import { describe, expect, it } from 'vitest';
import { describeEmptyLLMResponse } from '@/lib/ai/llm';

describe('empty LLM response diagnostics', () => {
  it('includes the generation source and provider response metadata', () => {
    const message = describeEmptyLLMResponse('scene-content', {
      finishReason: 'stop',
      usage: { inputTokens: 12, outputTokens: 0 },
      response: { modelId: 'gemini-2.5-flash', id: 'vertex-response-1' },
    });

    expect(message).toContain('source=scene-content');
    expect(message).toContain('model=gemini-2.5-flash');
    expect(message).toContain('finishReason=stop');
    expect(message).toContain('outputTokens');
  });
});
