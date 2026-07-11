'use client';

import { useEffect, useState } from 'react';
import { Stage } from '@/components/stage';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { useStageStore } from '@/lib/store';
import '@/app/student.css';

const DEMO_ID = 'demo-classroom-preview';

const now = 1720000000000;

function txt(
  id: string,
  left: number,
  top: number,
  width: number,
  height: number,
  html: string,
  color = '#fff4dc',
  size = 18,
  align = 'left',
): object {
  return {
    type: 'text',
    id,
    left,
    top,
    width,
    height,
    rotate: 0,
    defaultFontName: 'STZhongsong',
    defaultColor: color,
    content: `<p style="text-align:${align};"><span style="font-size:${size}px;color:${color};">${html}</span></p>`,
    lineHeight: 1.7,
    vAlign: 'top',
  };
}

function makeSlide(id: string, elements: object[], bgColor = '#050711'): object {
  return {
    id,
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: {
      backgroundColor: bgColor,
      themeColors: ['#ffc55a', '#c6d0df', '#fff4dc', '#5a32b4', '#143c9e'],
      fontColor: '#fff4dc',
      fontName: 'STZhongsong',
    },
    background: { type: 'solid', color: bgColor },
    elements,
  };
}

function makeScene(id: string, stageId: string, title: string, order: number, canvas: object): object {
  return {
    id,
    stageId,
    title,
    order,
    type: 'slide',
    content: { type: 'slide', schemaVersion: 2, canvas },
    createdAt: now,
    updatedAt: now,
  };
}

const SLIDES = [
  makeSlide('s1', [
    txt('t1-1', 80, 180, 840, 80,
      '羲和 · 太阳天火课堂',
      '#ffc55a', 48, 'center'),
    txt('t1-2', 80, 290, 840, 60,
      '星燧计划 · 神话与古天文系列',
      '#c6d0df', 20, 'center'),
    txt('t1-3', 80, 390, 840, 40,
      '从羲和驭日到羲和号卫星，走进太阳神话与中国古天文的光路',
      '#fff4dc', 15, 'center'),
    {
      type: 'shape', id: 'line1',
      left: 340, top: 360, width: 320, height: 2, rotate: 0,
      viewBox: [200, 200],
      path: 'M 0 100 L 200 100',
      fixedRatio: false,
      fill: 'rgba(255,197,90,0.45)',
      outline: { color: 'rgba(255,197,90,0.45)', width: 2, style: 'solid' },
    },
  ]),

  makeSlide('s2', [
    txt('t2-1', 60, 60, 880, 60,
      '第一板块 · 神话之火', '#ffc55a', 32, 'left'),
    txt('t2-2', 60, 140, 880, 30,
      '羲和 — 驾驭太阳的女神', '#c6d0df', 16, 'left'),
    txt('t2-3', 60, 190, 500, 280,
      `<span style="font-size:15px;color:#fff4dc;line-height:1.9;">
        羲和是中国神话中的太阳女神，每天驾驭六条蛟龙拉的马车，载着太阳穿越天空。<br/>
        古人以她的巡行解释昼夜更替，以她的驻留解释正午高悬。<br/><br/>
        羲和神话的本质，是古人将可观测的天象——日出、日落、正午——
        编码为可口述的叙事，形成最早的"天文记忆系统"。
      </span>`.replace(/\s+/g, ' '),
      '#fff4dc', 15, 'left'),
    {
      type: 'shape', id: 'badge1',
      left: 620, top: 170, width: 300, height: 280, rotate: 0,
      viewBox: [200, 200],
      path: 'M 10 10 L 190 10 L 190 190 L 10 190 Z',
      fixedRatio: false,
      fill: 'rgba(90,50,180,0.25)',
      outline: { color: 'rgba(255,197,90,0.28)', width: 1, style: 'solid' },
      radius: 12,
    },
    txt('t2-4', 632, 185, 276, 250,
      `<span style="font-size:13px;color:#c6d0df;line-height:1.9;">
        关键概念<br/>
        ─────────────<br/>
        · 昼夜 → 羲和出行/归返<br/>
        · 正午 → 羲和驻马扶桑<br/>
        · 日食 → 天狗吞日传说<br/>
        · 十日 → 后羿射日起源<br/>
      </span>`.replace(/\s+/g, ' '),
      '#c6d0df', 13, 'left'),
  ]),

  makeSlide('s3', [
    txt('t3-1', 60, 60, 880, 60,
      '第二板块 · 古天文之象', '#ffc55a', 32, 'left'),
    txt('t3-2', 60, 140, 880, 30,
      '圭表测日与二十四节气', '#c6d0df', 16, 'left'),
    txt('t3-3', 60, 190, 840, 260,
      `<span style="font-size:15px;color:#fff4dc;line-height:1.9;">
        <b style="color:#ffc55a;">圭表</b>是中国最早的天文仪器之一——
        将一根竖立的"表"（标杆）投影到水平"圭"（刻度尺）上，通过测量正午影长，
        确定节气时刻。<br/><br/>
        冬至影最长，夏至影最短，两者之差精确到厘米，误差在数分钟内。<br/>
        周代已通过圭表将一年精确划分为二十四节气，形成农耕历法的核心骨架。<br/><br/>
        <b style="color:#c6d0df;">类比：</b>
        圭表就是一台只靠影子工作的"太阳时钟"——无需电力，无需透镜，
        只靠几何关系，便能把太阳运动翻译成可记录的数字。
      </span>`.replace(/\s+/g, ' '),
      '#fff4dc', 15, 'left'),
  ]),

  makeSlide('s4', [
    txt('t4-1', 60, 60, 880, 60,
      '现代延伸 · 羲和号卫星', '#ffc55a', 32, 'left'),
    txt('t4-2', 60, 140, 880, 30,
      '2021年发射，中国首颗太阳探测科学技术试验卫星', '#c6d0df', 16, 'left'),
    txt('t4-3', 60, 200, 440, 260,
      `<span style="font-size:15px;color:#fff4dc;line-height:1.9;">
        羲和号以神话中的太阳女神命名，运行于高度约517公里的太阳同步轨道，
        搭载太阳Hα成像光谱仪。<br/><br/>
        <b style="color:#ffc55a;">科学使命：</b><br/>
        · 获取太阳全日面Hα波段光谱<br/>
        · 研究太阳爆发的物理机制<br/>
        · 分析色球层精细结构<br/><br/>
        神话中羲和驭日，现实里羲和号追日——
        相隔数千年，中华民族对太阳的凝视从未停止。
      </span>`.replace(/\s+/g, ' '),
      '#fff4dc', 15, 'left'),
    {
      type: 'shape', id: 'orbit',
      left: 580, top: 170, width: 320, height: 280, rotate: 0,
      viewBox: [200, 200],
      path: 'M 100 20 A 80 80 0 1 1 99.9 20',
      fixedRatio: false,
      fill: 'transparent',
      outline: { color: 'rgba(255,197,90,0.3)', width: 1.5, style: 'dashed' },
    },
    txt('t4-4', 600, 270, 280, 100,
      '<span style="font-size:22px;text-align:center;color:#ffc55a;">☀</span>',
      '#ffc55a', 22, 'center'),
  ]),
];

const MOCK_STAGE = {
  id: DEMO_ID,
  name: '羲和·太阳天火课堂',
  description: '星燧计划演示课堂',
  createdAt: now,
  updatedAt: now,
};

const MOCK_SCENES = SLIDES.map((canvas, i) => {
  const titles = ['封面', '神话之火', '古天文之象', '羲和号卫星'];
  return makeScene(`scene-${i + 1}`, DEMO_ID, titles[i], i + 1, canvas);
});

export default function DemoClassroomPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const store = useStageStore.getState();
    store.setStage(MOCK_STAGE as Parameters<typeof store.setStage>[0]);
    store.setScenes(MOCK_SCENES as Parameters<typeof store.setScenes>[0]);
    useStageStore.setState({
      currentSceneId: 'scene-1',
      mode: 'playback',
      generationComplete: true,
    });
    setReady(true);

    return () => {
      useStageStore.setState({
        stage: null,
        scenes: [],
        currentSceneId: null,
        generationComplete: false,
      });
    };
  }, []);

  if (!ready) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#050711', color: '#c6d0df', fontFamily: 'STZhongsong,serif',
      }}>
        加载中…
      </div>
    );
  }

  return (
    <ThemeProvider>
      <MediaStageProvider value={DEMO_ID}>
        <div className="student-page" style={{ height: '100dvh', minHeight: 'unset', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Stage />
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
