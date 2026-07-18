'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, Loader2, Presentation } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { createLogger } from '@/lib/logger';
import { saveAsset, updateAsset } from '@/lib/teacher/history';
import { toProgressPercent } from '@/lib/teacher/progress';
import type { TeacherAsset } from '@/lib/teacher/types';

const log = createLogger('PptGeneratorPanel');
const POLL_INTERVAL_MS = 5000;

interface PollResponse {
  success?: boolean;
  jobId?: string;
  status?: 'queued' | 'running' | 'succeeded' | 'failed';
  step?: string;
  progress?: number;
  message?: string;
  scenesGenerated?: number;
  totalScenes?: number;
  result?: { classroomId: string; url?: string; scenesCount?: number };
  error?: string;
  done?: boolean;
  details?: string;
}

interface SubmitResponse {
  success?: boolean;
  jobId?: string;
  status?: string;
  step?: string;
  message?: string;
  error?: string;
  details?: string;
}

interface JobState {
  jobId: string;
  assetId: string;
  status: PollResponse['status'];
  step?: string;
  progress?: number;
  message?: string;
  scenesGenerated?: number;
  totalScenes?: number;
  classroomId?: string;
  error?: string;
  done: boolean;
}

export function PptGeneratorPanel() {
  const { t } = useI18n();
  const [topic, setTopic] = useState('');
  const [audienceLevel, setAudienceLevel] = useState('');
  const [durationMin, setDurationMin] = useState('45');
  const [slidesCount, setSlidesCount] = useState('12');
  const [notes, setNotes] = useState('');
  const [includeQuiz, setIncludeQuiz] = useState(true);
  const [includeInteractive, setIncludeInteractive] = useState(false);
  const [generateVideo, setGenerateVideo] = useState(false);
  const [generateTTS, setGenerateTTS] = useState(true);
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
    async (jobId: string, assetId: string) => {
      try {
        const res = await fetch(`/api/generate-classroom/${jobId}`, { cache: 'no-store' });
        const data = (await res.json()) as PollResponse;
        if (!res.ok || !data.success) {
          const err = data.details || data.error || `HTTP ${res.status}`;
          setJob((prev) =>
            prev && prev.jobId === jobId
              ? { ...prev, done: true, status: 'failed', error: err }
              : prev,
          );
          updateAsset(assetId, { status: 'error', error: err });
          toast.error(t('teacher.ppt.error.pollFailed'));
          return;
        }
        setJob((prev) =>
          prev && prev.jobId === jobId
            ? {
                ...prev,
                status: data.status,
                step: data.step ?? prev.step,
                progress: data.progress ?? prev.progress,
                message: data.message ?? prev.message,
                scenesGenerated: data.scenesGenerated ?? prev.scenesGenerated,
                totalScenes: data.totalScenes ?? prev.totalScenes,
                classroomId: data.result?.classroomId ?? prev.classroomId,
                error: data.error,
                done: !!data.done,
              }
            : prev,
        );
        if (data.done) {
          if (data.status === 'succeeded' && data.result?.classroomId) {
            updateAsset(assetId, {
              status: 'ready',
              ref: { classroomId: data.result.classroomId, jobId },
            });
          } else {
            updateAsset(assetId, {
              status: 'error',
              error: data.error || 'Job failed',
            });
          }
          return;
        }
        pollTimerRef.current = setTimeout(() => pollOnce(jobId, assetId), POLL_INTERVAL_MS);
      } catch (err) {
        log.error('poll failed:', err);
        pollTimerRef.current = setTimeout(() => pollOnce(jobId, assetId), POLL_INTERVAL_MS);
      }
    },
    [t],
  );

  const buildRequirement = () => {
    const parts = [
      `课程主题: ${topic.trim()}`,
      audienceLevel.trim() && `学生水平: ${audienceLevel.trim()}`,
      Number(durationMin) > 0 && `课时时长: ${durationMin} 分钟`,
      Number(slidesCount) > 0 && `期望幻灯片数量: ${slidesCount}`,
      includeQuiz ? '包含随堂测验题' : '不需要测验题',
      includeInteractive ? '包含可交互互动内容' : null,
      generateVideo ? '为核心讲解生成 Manim 视频' : null,
      generateTTS ? '为讲解生成 TTS 语音' : null,
      notes.trim() && `其他要求: ${notes.trim()}`,
    ].filter(Boolean);
    return parts.join('\n');
  };

  const handleSubmit = async () => {
    if (!topic.trim()) {
      toast.error(t('teacher.ppt.error.topicRequired'));
      return;
    }
    setSubmitting(true);
    clearPoll();
    try {
      const requirement = buildRequirement();
      const res = await fetch('/api/generate-classroom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement,
          enableVideoGeneration: generateVideo,
          enableTTS: generateTTS,
        }),
      });
      const data = (await res.json()) as SubmitResponse;
      if (!res.ok || !data.success || !data.jobId) {
        toast.error(data.details || data.error || `HTTP ${res.status}`);
        return;
      }
      const now = Date.now();
      const assetId = nanoid(10);
      const asset: TeacherAsset = {
        id: assetId,
        type: 'classroom-ppt',
        title: topic.trim().slice(0, 60),
        status: 'running',
        createdAt: now,
        updatedAt: now,
        ref: { jobId: data.jobId },
      };
      saveAsset(asset);
      setJob({
        jobId: data.jobId,
        assetId,
        status: (data.status as PollResponse['status']) || 'queued',
        step: data.step,
        message: data.message,
        done: false,
      });
      pollOnce(data.jobId, assetId);
    } catch (err) {
      log.error('submit failed:', err);
      toast.error(t('teacher.ppt.error.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const running = !!job && !job.done;
  const succeeded = !!job && job.done && job.status === 'succeeded' && !!job.classroomId;
  const failed = !!job && job.done && job.status !== 'succeeded';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('teacher.ppt.topic')} full>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Field>
        <Field label={t('teacher.ppt.audienceLevel')}>
          <Input
            value={audienceLevel}
            onChange={(e) => setAudienceLevel(e.target.value)}
            placeholder={t('teacher.ppt.audienceLevelPlaceholder')}
          />
        </Field>
        <Field label={t('teacher.ppt.durationMin')}>
          <Input
            type="number"
            min={5}
            max={240}
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
          />
        </Field>
        <Field label={t('teacher.ppt.slidesCount')}>
          <Input
            type="number"
            min={1}
            max={60}
            value={slidesCount}
            onChange={(e) => setSlidesCount(e.target.value)}
          />
        </Field>
        <Field label={t('teacher.ppt.notes')} full>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={t('teacher.ppt.notesPlaceholder')}
          />
        </Field>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <ToggleRow
          checked={includeQuiz}
          onChange={setIncludeQuiz}
          label={t('teacher.ppt.includeQuiz')}
        />
        <ToggleRow
          checked={includeInteractive}
          onChange={setIncludeInteractive}
          label={t('teacher.ppt.includeInteractive')}
        />
        <ToggleRow
          checked={generateVideo}
          onChange={setGenerateVideo}
          label={t('teacher.ppt.generateVideo')}
          hint={t('teacher.ppt.generateVideoHint')}
        />
        <ToggleRow
          checked={generateTTS}
          onChange={setGenerateTTS}
          label={t('teacher.ppt.generateTTS')}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleSubmit} disabled={submitting || running}>
          {submitting || running ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('teacher.ppt.generating')}
            </>
          ) : (
            <>
              <Presentation className="size-4" />
              {t('teacher.ppt.generate')}
            </>
          )}
        </Button>
      </div>

      {job && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{t('teacher.ppt.progressTitle')}</span>
            <span className="text-muted-foreground/70">{job.status}</span>
            {job.step && <span className="text-muted-foreground/60">· {job.step}</span>}
          </div>
          {typeof job.progress === 'number' && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-all"
                style={{ width: `${toProgressPercent(job.progress)}%` }}
              />
            </div>
          )}
          {typeof job.totalScenes === 'number' && (
            <p className="text-xs text-muted-foreground/80">
              {job.scenesGenerated ?? 0} / {job.totalScenes} {t('teacher.ppt.scenes')}
            </p>
          )}
          {job.message && (
            <p className="text-xs text-muted-foreground/80 whitespace-pre-line">{job.message}</p>
          )}
          {succeeded && job.classroomId && (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-500" />
              <Link
                href={`/classroom/${job.classroomId}`}
                className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90"
              >
                {t('teacher.ppt.openClassroom')}
                <ExternalLink className="size-3.5" />
              </Link>
            </div>
          )}
          {failed && (
            <p className="text-xs text-destructive">
              {t('teacher.ppt.error.failed')}: {job.error}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  full = false,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ToggleRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 rounded-md border border-border/50 px-3 py-2 cursor-pointer hover:bg-muted/40">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground/70">{hint}</div>}
      </div>
    </label>
  );
}
