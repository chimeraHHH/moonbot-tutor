import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LESSON_LANGUAGE,
  buildNarrationRequirement,
  resolveLessonLanguage,
} from '@/lib/media/lesson-language';

describe('resolveLessonLanguage', () => {
  it('defaults to Simplified Chinese when absent/unknown', () => {
    expect(DEFAULT_LESSON_LANGUAGE).toBe('zh-CN');
    expect(resolveLessonLanguage(undefined)).toBe('zh-CN');
    expect(resolveLessonLanguage('')).toBe('zh-CN');
    expect(resolveLessonLanguage('   ')).toBe('zh-CN');
    expect(resolveLessonLanguage('klingon')).toBe('zh-CN');
  });

  it('resolves Chinese from enum, locale, or directive', () => {
    expect(resolveLessonLanguage('zh-CN')).toBe('zh-CN');
    expect(resolveLessonLanguage('整堂课必须使用简体中文')).toBe('zh-CN');
  });

  it('resolves English only when explicit', () => {
    expect(resolveLessonLanguage('en-US')).toBe('en-US');
    expect(resolveLessonLanguage('Teach in English')).toBe('en-US');
  });

  it('resolves bilingual', () => {
    expect(resolveLessonLanguage('bilingual')).toBe('bilingual');
    expect(resolveLessonLanguage('中英双语')).toBe('bilingual');
  });
});

describe('buildNarrationRequirement', () => {
  it('requires Chinese narration/subtitles/TTS for zh-CN', () => {
    const req = buildNarrationRequirement('zh-CN');
    expect(req).toContain('简体中文');
    expect(req).toContain('旁白');
    expect(req).toContain('字幕');
    expect(req).toContain('TTS');
  });

  it('requires English for en-US', () => {
    const req = buildNarrationRequirement('en-US');
    expect(req).toContain('English');
    expect(req).not.toContain('简体中文');
  });

  it('requires bilingual output for bilingual', () => {
    const req = buildNarrationRequirement('bilingual');
    expect(req).toContain('简体中文');
    expect(req).toContain('英文');
  });
});
