export interface LessonLanguage {
  locale: string;
  displayName: string;
  instruction: string;
}

export interface ResolveLessonLanguageInput {
  explicitLocale?: string;
  userInput?: string;
  uiLocale?: string;
}
