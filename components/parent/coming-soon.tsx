'use client';

import { Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

export function ParentComingSoon() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center px-6 py-16">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/80 to-blue-500/80 text-white shadow-md">
          <Sparkles className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('parent.comingSoon.title')}
        </h1>
        <p className="text-sm text-muted-foreground/80 leading-relaxed">
          {t('parent.comingSoon.description')}
        </p>
      </div>
    </div>
  );
}
