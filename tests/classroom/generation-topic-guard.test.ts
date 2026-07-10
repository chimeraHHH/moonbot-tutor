import { describe, expect, it } from 'vitest';
import {
  actionTextLooksLikeMissingContext,
  buildAuthoritativeTopicInstruction,
  extractTopicKeyword,
  outlinesLookLikePromptExampleDrift,
  outlinesMatchTopic,
  slideContentLooksLikePromptLeak,
} from '@/lib/classroom/generation';
import type { SceneOutline } from '@/lib/types/generation';

function outline(title: string, description: string, keyPoints: string[]): SceneOutline {
  return { id: title, order: 1, type: 'slide', title, description, keyPoints };
}

describe('generation topic guards', () => {
  it('anchors the real topic after prompt examples', () => {
    const instruction = buildAuthoritativeTopicInstruction('请给我讲讲嫦娥奔月的故事');
    expect(instruction).toContain('请给我讲讲嫦娥奔月的故事');
    expect(instruction).toContain('examples, not the requested course');
  });

  it("rejects projectile-motion outlines for a Chang'e lesson", () => {
    expect(
      outlinesMatchTopic('请给我讲讲嫦娥奔月的故事', [
        outline('抛体运动', '理解物体在重力下的轨迹', ['初速度', '抛物线']),
      ]),
    ).toBe(false);
    expect(
      outlinesMatchTopic('请给我讲讲嫦娥奔月的故事', [
        outline('嫦娥奔月', '讲述嫦娥奔月的神话故事', ['故事起因', '奔月经过']),
      ]),
    ).toBe(true);
  });

  it('keeps the actual Chinese subject when the request includes intent and media wording', () => {
    const topic = '我想学习祝融的故事 用动画';

    expect(extractTopicKeyword(topic)).toBe('祝融');
    expect(
      outlinesMatchTopic(topic, [
        outline('祝融是谁', '介绍祝融在中国神话中的身份', ['火神祝融', '神话来源']),
      ]),
    ).toBe(true);
    expect(
      outlinesMatchTopic(topic, [
        outline('抛体运动', '理解物体在重力下的轨迹', ['初速度', '抛物线']),
      ]),
    ).toBe(false);
  });

  it('does not remove animation when animation itself is the lesson subject', () => {
    expect(extractTopicKeyword('我想学习动画原理')).toBe('动画原理');
  });

  it('does not reject document-driven outlines merely because wording differs', () => {
    const generated = [
      outline('企业新人入职指南', '基于上传材料梳理入职流程', ['账号开通', '合规要求']),
    ];

    expect(outlinesMatchTopic('根据上传的文档生成一份 PPT', generated)).toBe(false);
    expect(outlinesLookLikePromptExampleDrift('根据上传的文档生成一份 PPT', generated)).toBe(false);
  });

  it('still rejects the concrete projectile-motion prompt example when it leaks', () => {
    expect(
      outlinesLookLikePromptExampleDrift('请给我讲讲嫦娥奔月的故事', [
        outline('Intro to Projectile Motion', 'Explore projectile trajectories', [
          'angle',
          'velocity',
        ]),
      ]),
    ).toBe(true);
  });

  it('rejects prompt instructions copied into a generated slide', () => {
    expect(
      slideContentLooksLikePromptLeak([
        { type: 'text', content: 'Slide Content Design Principles', id: 'a' },
        { type: 'text', content: 'On the Slide / Off the Slide', id: 'b' },
      ] as never),
    ).toBe(true);
  });

  it('rejects the model missing-slide-details response', () => {
    expect(
      actionTextLooksLikeMissingContext(
        "I'm ready to generate the slide action sequence, but I need the slide details first.",
      ),
    ).toBe(true);
  });
});
