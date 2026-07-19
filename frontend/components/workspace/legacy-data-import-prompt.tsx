'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  findLegacyLocalStorageEntries,
  findLegacySessionStorageEntries,
  importLegacyLocalStorageEntries,
  importLegacySessionStorageEntries,
  scopedSessionStorage,
} from '@/lib/client-storage/scope';
import {
  databaseSummaryHasRecords,
  importLegacyDatabase,
  inspectActiveDatabase,
  inspectLegacyDatabase,
  type LegacyDatabaseSummary,
} from '@/lib/utils/database';

const DISMISS_KEY = 'legacy-data-import-prompt-dismissed';

interface LegacyDiscovery {
  database: LegacyDatabaseSummary;
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  databaseBlocked: boolean;
}

function isPublicSharePage(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return window.location.pathname.startsWith('/classroom/') && params.has('shareToken');
}

export function LegacyDataImportPrompt() {
  const [discovery, setDiscovery] = useState<LegacyDiscovery | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isPublicSharePage() || scopedSessionStorage.getItem(DISMISS_KEY) === '1') return;

    let cancelled = false;
    void (async () => {
      try {
        const [database, localStorageKeys, sessionStorageKeys] = await Promise.all([
          inspectLegacyDatabase(),
          Promise.resolve(findLegacyLocalStorageEntries()),
          Promise.resolve(findLegacySessionStorageEntries()),
        ]);
        const hasLegacyDatabaseData = databaseSummaryHasRecords(database);
        if (
          !hasLegacyDatabaseData &&
          localStorageKeys.length === 0 &&
          sessionStorageKeys.length === 0
        ) {
          return;
        }

        const activeDatabase = hasLegacyDatabaseData ? await inspectActiveDatabase() : null;
        if (!cancelled) {
          setDiscovery({
            database,
            localStorageKeys,
            sessionStorageKeys,
            databaseBlocked: activeDatabase ? databaseSummaryHasRecords(activeDatabase) : false,
          });
        }
      } catch {
        // Storage can be unavailable in strict privacy modes. Do not interrupt
        // the workspace when discovery itself cannot run.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!discovery) return null;

  const legacyDatabaseHasData = databaseSummaryHasRecords(discovery.database);
  const legacyBrowserEntryCount =
    discovery.localStorageKeys.length + discovery.sessionStorageKeys.length;

  const dismiss = () => {
    scopedSessionStorage.setItem(DISMISS_KEY, '1');
    setDiscovery(null);
  };

  const importData = async () => {
    if (importing || discovery.databaseBlocked) return;
    setImporting(true);
    setError('');
    try {
      if (legacyDatabaseHasData) {
        // Re-check immediately before the write so a course created while the
        // prompt was open cannot be merged accidentally.
        const destination = await inspectActiveDatabase();
        if (databaseSummaryHasRecords(destination)) {
          throw new Error('当前账户已有课程数据，不能与旧课程自动合并。');
        }
        await importLegacyDatabase({ confirmed: true });
      }
      importLegacyLocalStorageEntries(discovery.localStorageKeys, { confirmed: true });
      importLegacySessionStorageEntries(discovery.sessionStorageKeys, { confirmed: true });
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '旧数据导入失败，请稍后重试。');
      setImporting(false);
    }
  };

  return (
    <section
      role="dialog"
      aria-labelledby="legacy-import-title"
      aria-describedby="legacy-import-description"
      className="fixed bottom-5 right-5 z-[100] w-[min(390px,calc(100vw-2rem))] rounded-2xl border border-amber-300/60 bg-background/95 p-5 shadow-2xl backdrop-blur"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          <ArchiveRestore className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="legacy-import-title" className="text-sm font-semibold">
            发现旧版浏览器数据
          </h2>
          <p
            id="legacy-import-description"
            className="mt-1.5 text-xs leading-5 text-muted-foreground"
          >
            这些旧数据没有账户归属。只有你明确确认后，才会导入当前账户；系统不会自动认领，也不会覆盖已有设置。
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {legacyDatabaseHasData ? '包含旧课程数据' : '不含旧课程'}
            {legacyBrowserEntryCount > 0 ? ` · ${legacyBrowserEntryCount} 项浏览器数据` : ''}
          </p>
        </div>
      </div>

      {discovery.databaseBlocked && (
        <div className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          当前账户已有课程数据。为避免错误合并，旧课程导入已禁用；请先导出或清空当前账户课程。
        </div>
      )}

      {error && <p className="mt-3 text-xs leading-5 text-destructive">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={importing}>
          暂不导入
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void importData()}
          disabled={importing || discovery.databaseBlocked}
        >
          {importing ? '正在导入' : '确认导入当前账户'}
        </Button>
      </div>
    </section>
  );
}
