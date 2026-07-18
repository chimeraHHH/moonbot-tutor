'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { Download, Loader2, Play, Video } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { createLogger } from '@/lib/logger';
import { saveAsset, updateAsset } from '@/lib/teacher/history';
import { toProgressPercent } from '@/lib/teacher/progress';
import type { TeacherAsset } from '@/lib/teacher/types';

const log = createLogger('DeepSolvePanel');
const POLL_INTERVAL_MS = 5000;

interface JobState {
  taskId: string;
  assetId: string;
  state: string;
  progress?: number;
  stage?: string;
  videoUrl?: string;
  error?: string;
  done: boolean;
}

interface StatusResponse {
  success?: boolean;
  taskId?: string;
  state?: string;
  progress?: number;
  stage?: string;
  videoUrl?: string;
  error?: string;
  done?: boolean;
  details?: string;
}

interface SubmitResponse {
  success?: boolean;
  taskId?: string;
  taskAccessToken?: string;
  error?: string;
  details?: string;
  errorCode?: string;
}

export function DeepSolvePanel() {
  const { t, locale } = useI18n();
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const pollOnce = useCallback(
    async (taskId: string, assetId: string, taskAccessToken: string) => {
      try {
        const query = new URLSearchParams({ accessToken: taskAccessToken });
        const res = await fetch(`/api/teacher/deep-solve/tasks/${taskId}?${query}`, {
          cache: 'no-store',
        });
        const data = (await res.json()) as StatusResponse;
        if (!res.ok || !data.success) {
          const err = data.details || data.error || `HTTP ${res.status}`;
          setJob((prev) =>
            prev && prev.taskId === taskId
              ? { ...prev, done: true, error: err, state: 'failed' }
              : prev,
          );
          updateAsset(assetId, { status: 'error', error: err });
          toast.error(t('teacher.deepSolve.error.pollFailed'));
          return;
        }
        setJob((prev) =>
          prev && prev.taskId === taskId
            ? {
                ...prev,
                state: data.state || prev.state,
                progress: data.progress ?? prev.progress,
                stage: data.stage ?? prev.stage,
                videoUrl: data.videoUrl ?? prev.videoUrl,
                error: data.error,
                done: !!data.done,
              }
            : prev,
        );
        if (data.done) {
          if (data.state === 'succeeded') {
            updateAsset(assetId, { status: 'ready' });
          } else {
            updateAsset(assetId, {
              status: 'error',
              error: data.error || `Task ${data.state}`,
            });
          }
          return;
        }
        pollTimerRef.current = setTimeout(
          () => pollOnce(taskId, assetId, taskAccessToken),
          POLL_INTERVAL_MS,
        );
      } catch (err) {
        log.error('poll failed:', err);
        pollTimerRef.current = setTimeout(
          () => pollOnce(taskId, assetId, taskAccessToken),
          POLL_INTERVAL_MS,
        );
      }
    },
    [t],
  );

  const handleSubmit = async () => {
    const q = question.trim();
    if (!q) {
      toast.error(t('teacher.deepSolve.error.questionRequired'));
      return;
    }
    setSubmitting(true);
    clearPoll();
    try {
      const res = await fetch('/api/teacher/deep-solve/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context: context.trim() || undefined,
          lessonLanguage: locale,
        }),
      });
      const data = (await res.json()) as SubmitResponse;
      if (!res.ok || !data.success || !data.taskId || !data.taskAccessToken) {
        const detail = data.details || data.error || `HTTP ${res.status}`;
        toast.error(
          data.errorCode === 'UPSTREAM_ERROR'
            ? t('teacher.deepSolve.error.bridgeUnavailable')
            : detail,
        );
        setSubmitting(false);
        return;
      }
      const now = Date.now();
      const assetId = nanoid(10);
      const asset: TeacherAsset = {
        id: assetId,
        type: 'manim-video',
        title: q.slice(0, 60),
        status: 'running',
        createdAt: now,
        updatedAt: now,
        ref: { taskId: data.taskId },
      };
      saveAsset(asset);
      setJob({ taskId: data.taskId, assetId, state: 'queued', done: false });
      pollOnce(data.taskId, assetId, data.taskAccessToken);
    } catch (err) {
      log.error('submit failed:', err);
      toast.error(t('teacher.deepSolve.error.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const running = !!job && !job.done;
  const succeeded = !!job && job.done && job.state === 'succeeded' && !!job.videoUrl;
  const failed = !!job && job.done && job.state !== 'succeeded';

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            {t('teacher.deepSolve.questionLabel')}
          </label>
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('teacher.deepSolve.questionPlaceholder')}
            rows={4}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            {t('teacher.deepSolve.contextLabel')}
          </label>
          <Textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={t('teacher.deepSolve.contextPlaceholder')}
            rows={3}
            className="mt-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSubmit} disabled={submitting || running}>
            {submitting || running ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('teacher.deepSolve.submitting')}
              </>
            ) : (
              <>
                <Play className="size-4" />
                {t('teacher.deepSolve.submit')}
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground/70">{t('teacher.deepSolve.notice')}</p>
        </div>
      </div>

      {job && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Video className="size-4 text-violet-500" />
            <span className="font-medium">{t('teacher.deepSolve.progressTitle')}</span>
            <span className="text-muted-foreground/70">
              {t(`teacher.deepSolve.state.${job.state}`, {
                defaultValue: job.state,
              })}
            </span>
          </div>
          {typeof job.progress === 'number' && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-all"
                style={{ width: `${toProgressPercent(job.progress)}%` }}
              />
            </div>
          )}
          {job.stage && (
            <p className="text-xs text-muted-foreground">
              {t('teacher.deepSolve.stage')}: {job.stage}
            </p>
          )}
          {succeeded && job.videoUrl && (
            <div className="space-y-2">
              <video
                controls
                src={job.videoUrl}
                className="w-full rounded-lg bg-black aspect-video"
              />
              <div className="flex items-center gap-2">
                <a
                  href={job.videoUrl}
                  download={`deep-solve-${job.taskId}.mp4`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-xs hover:bg-muted/60"
                >
                  <Download className="size-3.5" />
                  {t('teacher.deepSolve.download')}
                </a>
              </div>
            </div>
          )}
          {failed && (
            <p className="text-xs text-destructive">
              {t('teacher.deepSolve.error.failed')}: {job.error}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
