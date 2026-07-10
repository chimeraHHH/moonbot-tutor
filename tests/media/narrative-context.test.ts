import { describe, expect, it } from 'vitest';
import { buildNarrativeVideoContext } from '@/lib/media/narrative-context';
import type { SceneOutline } from '@/lib/types/generation';

const outline: SceneOutline = {
  id: 'scene_1',
  type: 'slide',
  title: '从混沌初开到人类繁衍',
  description: '盘古与女娲代表了先民对宇宙起源的浪漫解读。',
  keyPoints: ['盘古开天辟地', '女娲创造人类'],
  teachingObjective: '理解神话的文化意义',
  order: 1,
};

describe('buildNarrativeVideoContext', () => {
  it('carries authoritative page and course context into Manim generation', () => {
    expect(
      buildNarrativeVideoContext(outline, {
        title: '中国古代神话',
        description: '了解中国先民的宇宙观。',
        targetLanguage: 'zh-CN',
        languageDirective: '使用简体中文',
      }),
    ).toEqual({
      pageTitle: outline.title,
      teachingNote: outline.description,
      keyPoints: outline.keyPoints,
      teachingObjective: outline.teachingObjective,
      courseTitle: '中国古代神话',
      courseDescription: '了解中国先民的宇宙观。',
      targetLanguage: 'zh-CN',
      languageDirective: '使用简体中文',
    });
  });
});
