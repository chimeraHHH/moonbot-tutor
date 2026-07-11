'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type Locale } from '@/lib/i18n';
import '@/lib/i18n/config';

const LOCALE_STORAGE_KEY = 'locale';
const PRODUCT_LOCALE: Locale = 'zh-CN';

type I18nContextType = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();

  const locale = PRODUCT_LOCALE;

  // This student-only product intentionally exposes one language.
  useEffect(() => {
    if (i18n.language !== PRODUCT_LOCALE) void i18n.changeLanguage(PRODUCT_LOCALE);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, PRODUCT_LOCALE);
    } catch {
      // localStorage unavailable; in-memory locale is still Chinese.
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLocale = (_newLocale: Locale) => {
    void i18n.changeLanguage(PRODUCT_LOCALE);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, PRODUCT_LOCALE);
    } catch {
      // localStorage unavailable
    }
  };

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
