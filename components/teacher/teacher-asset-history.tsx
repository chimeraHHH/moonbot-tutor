'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Trash2, Video, Presentation, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Card } from '@/components/ui/card';
import { loadAssets, removeAsset, subscribeToAssets } from '@/lib/teacher/history';
import type { TeacherAsset, TeacherAssetType } from '@/lib/teacher/types';

const EMPTY_ASSETS: TeacherAsset[] = [];

const TYPE_ICON: Record<TeacherAssetType, typeof Video> = {
  'manim-video': Video,
  'interactive-html': Sparkles,
  'classroom-ppt': Presentation,
};

export function TeacherAssetHistory() {
  const { t } = useI18n();
  const [assets, setAssets] = useState<TeacherAsset[]>(EMPTY_ASSETS);

  useEffect(() => {
    const refresh = () => setAssets(loadAssets());
    refresh();
    return subscribeToAssets(refresh);
  }, []);

  if (assets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 py-8 text-center text-sm text-muted-foreground/60">
        {t('teacher.history.empty')}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {assets.map((a) => {
        const Icon = TYPE_ICON[a.type];
        const href =
          a.type === 'classroom-ppt' && a.ref.classroomId
            ? `/classroom/${a.ref.classroomId}`
            : undefined;
        return (
          <Card key={a.id} className="p-3 flex items-center gap-3">
            <Icon className="size-4 text-violet-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{a.title}</span>
                <StatusBadge status={a.status} t={t} />
              </div>
              <div className="text-xs text-muted-foreground/70">
                {t(`teacher.history.type.${a.type}`)} · {new Date(a.createdAt).toLocaleString()}
              </div>
              {a.error && (
                <div className="text-xs text-destructive truncate mt-0.5">{a.error}</div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {href && a.status === 'ready' && (
                <Link
                  href={href}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-muted/60"
                >
                  {t('teacher.history.open')}
                  <ExternalLink className="size-3" />
                </Link>
              )}
              <button
                onClick={() => removeAsset(a.id)}
                aria-label={t('teacher.history.delete')}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: TeacherAsset['status'];
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const cls =
    status === 'ready'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : status === 'error'
        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {t(`teacher.history.status.${status}`)}
    </span>
  );
}
