import { describe, expect, it } from 'vitest';
import {
  toStaticSlideOutline,
  withoutPresentationInteractions,
} from '@/lib/generation/presentation-mode';

describe('student competition presentation mode', () => {
  it('drops interactive and vocational request flags', () => {
    expect(
      withoutPresentationInteractions({
        requirement: '讲解嫦娥奔月',
        interactiveMode: true,
        taskEngineMode: true,
        webSearch: true,
      }),
    ).toEqual({ requirement: '讲解嫦娥奔月', webSearch: true });
  });

  it('converts every interactive PPT outline into an ordinary slide', () => {
    const result = toStaticSlideOutline({
      id: 'scene-1',
      order: 1,
      type: 'interactive',
      title: '月宫探索',
      description: '操作模拟器探索月宫',
      keyPoints: ['嫦娥', '月宫'],
      widgetType: 'simulation',
      widgetOutline: { concept: '月宫探索', interactions: ['drag'] },
      interactiveConfig: {
        conceptName: '月宫',
        conceptOverview: '探索月宫',
        designIdea: '拖拽交互',
      },
    });

    expect(result.type).toBe('slide');
    expect(result.widgetType).toBeUndefined();
    expect(result.widgetOutline).toBeUndefined();
    expect(result.interactiveConfig).toBeUndefined();
  });
});
