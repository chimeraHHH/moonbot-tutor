import type { LessonLanguage } from './types';

const LANGUAGE_NAMES: Record<string, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'en-US': 'English',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'pt-BR': 'Português (Brasil)',
  'ru-RU': 'Русский',
  'ar-SA': 'العربية',
};

export function getLanguageDisplayName(locale: string): string {
  return LANGUAGE_NAMES[locale] ?? locale;
}

export function buildLanguageInstruction(locale: string): string {
  const normalized = locale || 'zh-CN';
  if (normalized === 'zh-CN') {
    return '整堂课必须使用简体中文。所有标题、幻灯片正文、教师讲解、问答、学生发言、PBL 内容和测验反馈都以中文生成。编程标识符、公式和通用专有名词可保留英文；专有名词首次出现时尽量附上简短中文解释。不要在无必要时切换到英文。';
  }
  if (normalized === 'zh-TW') {
    return '整堂課必須使用繁體中文。所有標題、投影片正文、教師講解、問答、學生發言、PBL 內容和測驗回饋都以繁體中文生成。程式識別字、公式和通用專有名詞可保留英文；專有名詞首次出現時盡量附上簡短中文解釋。';
  }
  if (normalized === 'en-US') {
    return 'Use English for the entire lesson. Generate every title, slide body, teacher explanation, answer, student message, PBL item, and quiz response in English. Programming identifiers, formulas, and established technical terms may remain in their conventional form. Explain specialized terms briefly on first use when helpful.';
  }

  const displayName = getLanguageDisplayName(normalized);
  return `Use ${displayName} (${normalized}) for the entire lesson. Generate every title, slide body, teacher explanation, answer, student message, PBL item, and quiz response in that language. Programming identifiers, formulas, and established technical terms may remain in their conventional form. Explain specialized terms briefly on first use when helpful.`;
}

export function createLessonLanguage(locale: string): LessonLanguage {
  return {
    locale,
    displayName: getLanguageDisplayName(locale),
    instruction: buildLanguageInstruction(locale),
  };
}
