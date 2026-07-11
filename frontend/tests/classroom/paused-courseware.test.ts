import { describe, expect, it } from 'vitest';
import {
  pauseCoursewareOutline,
  pauseCoursewareOutlines,
} from '@/lib/classroom/paused-courseware';
import type { SceneOutline } from '@/lib/types/generation';

describe('paused courseware policy', () => {
  it('downgrades interactive 3D content to a static slide', () => {
    const paused = pauseCoursewareOutline({
      id: 'moon-phases',
      order: 1,
      type: 'interactive',
      title: '月相盈亏三维动态模拟',
      description: '拖动月球观察月相变化',
      keyPoints: ['日地月相对位置'],
      widgetType: 'visualization3d',
      widgetOutline: { concept: '月相变化' },
    });

    expect(paused.type).toBe('slide');
    expect(paused.widgetType).toBeUndefined();
    expect(paused.widgetOutline).toBeUndefined();
  });

  it('downgrades PBL and removes its runtime configuration', () => {
    const paused = pauseCoursewareOutline({
      id: 'project',
      order: 1,
      type: 'pbl',
      title: '项目',
      description: '协作项目',
      keyPoints: [],
      pblConfig: { projectTopic: '项目', projectDescription: '描述', targetSkills: [] },
    });

    expect(paused.type).toBe('slide');
    expect(paused.pblConfig).toBeUndefined();
  });

  it('leaves slides and quizzes unchanged', () => {
    const outlines: SceneOutline[] = [
      { id: 's', order: 1, type: 'slide', title: '讲解', description: '', keyPoints: [] },
      { id: 'q', order: 2, type: 'quiz', title: '测验', description: '', keyPoints: [] },
    ];
    expect(pauseCoursewareOutlines(outlines)).toEqual(outlines);
  });
});
