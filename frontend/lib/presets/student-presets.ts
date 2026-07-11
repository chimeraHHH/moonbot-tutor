export type StudentPresetKey = 'myth' | 'rocket';

export interface StudentPreset {
  key: StudentPresetKey;
  title: string;
  prompt: string;
}

export const STUDENT_PRESETS: Record<StudentPresetKey, StudentPreset> = {
  myth: {
    key: 'myth',
    title: '中国神话与古天文',
    prompt:
      '请以中国神话与古天文为主题，为学生设计一堂沉浸式中文课程。以羲和驭日、嫦娥奔月、祝融司火、伏羲观星等故事为线索，解释太阳、月相、火星“荧惑”和星宿观测背后的真实天文知识。课程要有清晰叙事、适合学生理解的类比、关键知识点与可视化演示，并由一位教师完整讲授。',
  },
  rocket: {
    key: 'rocket',
    title: '可回收火箭',
    prompt:
      '请以中国可回收火箭为主题，为学生设计一堂沉浸式中文课程。重点解释一级火箭分离、栅格舵气动控制、再入燃烧、发动机深度节流、组合导航和末端软着陆，串联中国可重复使用火箭的重要试验历程。课程要包含直观类比、关键物理原理、分阶段可视化演示与总结，并由一位教师完整讲授。',
  },
};

export function resolveStudentPreset(value: string | null | undefined): StudentPreset | null {
  return value === 'myth' || value === 'rocket' ? STUDENT_PRESETS[value] : null;
}
