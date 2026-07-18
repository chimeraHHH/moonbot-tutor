'use client';

import { useI18n } from '@/lib/hooks/use-i18n';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeepSolvePanel } from './deep-solve-panel';
import { InteractiveHtmlPanel } from './interactive-html-panel';
import { PptGeneratorPanel } from './ppt-generator-panel';
import { TeacherAssetHistory } from './teacher-asset-history';

export function TeacherWorkbench() {
  const { t } = useI18n();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('teacher.title')}</h1>
        <p className="text-sm text-muted-foreground/80">{t('teacher.subtitle')}</p>
      </header>

      <Tabs defaultValue="ppt" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:inline-flex sm:h-9 sm:w-fit">
          <TabsTrigger value="ppt" className="h-8 justify-start sm:justify-center">
            {t('teacher.tabs.pptGenerator')}
          </TabsTrigger>
          <TabsTrigger value="deep-solve" className="h-8 justify-start sm:justify-center">
            {t('teacher.tabs.deepSolve')}
          </TabsTrigger>
          <TabsTrigger value="interactive" className="h-8 justify-start sm:justify-center">
            {t('teacher.tabs.interactiveHtml')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ppt" forceMount>
          <PptGeneratorPanel />
        </TabsContent>
        <TabsContent value="deep-solve" forceMount>
          <DeepSolvePanel />
        </TabsContent>
        <TabsContent value="interactive" forceMount>
          <InteractiveHtmlPanel />
        </TabsContent>
      </Tabs>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">{t('teacher.history.title')}</h2>
        <TeacherAssetHistory />
      </section>
    </div>
  );
}
