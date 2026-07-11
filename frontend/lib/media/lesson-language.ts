/**
 * Lesson-language enum + helpers for the Deep Solve (Manim) pipeline.
 *
 * The cross-service protocol carries a small structured enum — never the raw
 * free-text `languageDirective`. The course directive is mapped to this enum at
 * the entry points (classroom media generation, teacher deep-solve route); the
 * enum then flows adapter → BFF → Python bridge → solve LLMs.
 *
 * Mirrors `services/code2video/src/lesson_language.py`. The default is
 * Simplified Chinese, so an absent/unrecognized value keeps narration,
 * subtitles and TTS text in Chinese. `en-US` and `bilingual` only take effect
 * when explicitly resolved.
 */

export type LessonLanguage = 'zh-CN' | 'en-US' | 'bilingual';

export const DEFAULT_LESSON_LANGUAGE: LessonLanguage = 'zh-CN';

// Bilingual is checked first: a bilingual directive usually also mentions one of
// the base languages.
const BILINGUAL_RE = /(?:bilingual|双语|中英|zh[-_]?en|en[-_]?zh)/i;
const CHINESE_RE = /(?:\bzh\b|zh[-_]|中文|简体|chinese)/i;
const ENGLISH_RE = /(?:\ben\b|en[-_]|english|英文|英语)/i;

/**
 * Resolve any language input (enum value, locale code, or free directive) to a
 * canonical enum. Absent/unrecognized input resolves to `zh-CN`.
 */
export function resolveLessonLanguage(input?: string | null): LessonLanguage {
  const text = (input ?? '').trim();
  if (!text) return DEFAULT_LESSON_LANGUAGE;
  if (BILINGUAL_RE.test(text)) return 'bilingual';
  if (CHINESE_RE.test(text)) return 'zh-CN';
  if (ENGLISH_RE.test(text)) return 'en-US';
  return DEFAULT_LESSON_LANGUAGE;
}

const NARRATION_REQUIREMENT: Record<LessonLanguage, string> = {
  'zh-CN':
    '语言要求：这段讲解视频的旁白、屏幕字幕和 TTS 语音文本都必须使用简体中文，不得使用英文叙述。数学符号、公式和通用专有名词可以保留原样。',
  'en-US':
    'Language requirement: the narration, on-screen subtitles and TTS text of this explainer video must all be in English. Keep mathematical symbols and formulas as-is.',
  bilingual:
    '语言要求：这段讲解视频的旁白、屏幕字幕和 TTS 语音文本都必须采用中英双语（先简体中文再英文），保持一致。数学符号与公式可保留原样。',
};

/**
 * Build the narration/subtitle/TTS language requirement appended to the
 * deep-solve question, reinforcing the course language at the user-message
 * level (the Python system prompt enforces the same at the system level).
 */
export function buildNarrationRequirement(language: LessonLanguage): string {
  return NARRATION_REQUIREMENT[language];
}
