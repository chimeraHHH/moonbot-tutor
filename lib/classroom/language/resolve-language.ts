import { createLessonLanguage } from './language-instruction';
import type { LessonLanguage, ResolveLessonLanguageInput } from './types';

const SUPPORTED_LOCALES = new Set([
  'zh-CN',
  'zh-TW',
  'en-US',
  'ja-JP',
  'ko-KR',
  'pt-BR',
  'ru-RU',
  'ar-SA',
]);

export function normalizeLessonLocale(locale?: string): string | undefined {
  if (!locale?.trim()) return undefined;
  const raw = locale.trim().replace('_', '-');
  const exact = [...SUPPORTED_LOCALES].find((item) => item.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  const language = raw.split('-')[0].toLowerCase();
  return [...SUPPORTED_LOCALES].find((item) => item.toLowerCase().startsWith(`${language}-`));
}

export function detectPrimaryLocale(text?: string): string | undefined {
  const value = text?.trim();
  if (!value) return undefined;

  const counts = {
    zh: (value.match(/[\u3400-\u9fff]/g) ?? []).length,
    ja: (value.match(/[\u3040-\u30ff]/g) ?? []).length,
    ko: (value.match(/[\uac00-\ud7af]/g) ?? []).length,
    ar: (value.match(/[\u0600-\u06ff]/g) ?? []).length,
    ru: (value.match(/[\u0400-\u04ff]/g) ?? []).length,
    latin: (value.match(/[A-Za-z\u00c0-\u024f]/g) ?? []).length,
  };

  if (counts.ja > 0) return 'ja-JP';
  if (counts.ko > 0) return 'ko-KR';
  if (counts.ar > counts.latin) return 'ar-SA';
  if (counts.ru > counts.latin) return 'ru-RU';
  if (counts.zh > 0 && counts.zh >= counts.latin * 0.25) return 'zh-CN';
  if (counts.latin > 0) return 'en-US';
  return undefined;
}

export function resolveLessonLanguage(input: ResolveLessonLanguageInput): LessonLanguage {
  const locale =
    normalizeLessonLocale(input.explicitLocale) ??
    detectPrimaryLocale(input.userInput) ??
    normalizeLessonLocale(input.uiLocale) ??
    'zh-CN';
  return createLessonLanguage(locale);
}

export function coerceLessonLanguage(
  value?: Partial<LessonLanguage> | null,
  fallback?: ResolveLessonLanguageInput,
): LessonLanguage {
  const locale = normalizeLessonLocale(value?.locale);
  if (locale) return createLessonLanguage(locale);
  return resolveLessonLanguage(fallback ?? {});
}
