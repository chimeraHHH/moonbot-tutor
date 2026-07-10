import { describe, expect, it } from 'vitest';
import { buildLanguageInstruction, resolveLessonLanguage } from '@/lib/classroom/language';
import { buildLanguageText } from '@/lib/generation/prompt-formatters';

describe('lesson language', () => {
  it('builds a Chinese-only classroom instruction for zh-CN', () => {
    const instruction = buildLanguageInstruction('zh-CN');
    expect(instruction).toContain('简体中文');
    expect(instruction).toContain('学生发言');
  });

  it('builds an English classroom instruction for en-US', () => {
    const instruction = buildLanguageInstruction('en-US');
    expect(instruction).toContain('Use English for the entire lesson');
    expect(instruction).toContain('student message');
  });

  it('uses input language before UI locale when no explicit lesson choice exists', () => {
    expect(
      resolveLessonLanguage({
        userInput: 'Explain process scheduling in operating systems',
        uiLocale: 'zh-CN',
      }).locale,
    ).toBe('en-US');
    expect(
      resolveLessonLanguage({
        userInput: '给我讲解操作系统中的进程调度',
        uiLocale: 'en-US',
      }).locale,
    ).toBe('zh-CN');
  });

  it('gives an explicit lesson choice highest priority', () => {
    expect(
      resolveLessonLanguage({
        explicitLocale: 'zh-CN',
        userInput: 'Explain process scheduling',
        uiLocale: 'en-US',
      }).locale,
    ).toBe('zh-CN');
  });

  it('does not let a per-scene note override the classroom language', () => {
    const classroomInstruction = buildLanguageInstruction('zh-CN');
    expect(buildLanguageText(classroomInstruction, 'Use English for this scene.')).toBe(
      classroomInstruction,
    );
  });
});
