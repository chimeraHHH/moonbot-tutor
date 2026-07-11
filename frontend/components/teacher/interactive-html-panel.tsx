'use client';

import { useState } from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { Copy, Download, Loader2, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { createLogger } from '@/lib/logger';
import { saveAsset } from '@/lib/teacher/history';
import type { TeacherAsset } from '@/lib/teacher/types';

const log = createLogger('InteractiveHtmlPanel');

interface GenResponse {
  success?: boolean;
  html?: string;
  error?: string;
  details?: string;
}

export function InteractiveHtmlPanel() {
  const { t } = useI18n();
  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [interactionType, setInteractionType] = useState('');
  const [audience, setAudience] = useState('');
  const [constraints, setConstraints] = useState('');
  const [busy, setBusy] = useState(false);
  const [html, setHtml] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!topic.trim() || !goal.trim() || !interactionType.trim() || !audience.trim()) {
      toast.error(t('teacher.interactiveHtml.error.missingFields'));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/teacher/interactive-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          goal: goal.trim(),
          interactionType: interactionType.trim(),
          audience: audience.trim(),
          constraints: constraints.trim() || undefined,
        }),
      });
      const data = (await res.json()) as GenResponse;
      if (!res.ok || !data.success || !data.html) {
        toast.error(data.details || data.error || t('teacher.interactiveHtml.error.generate'));
        return;
      }
      setHtml(data.html);
      const now = Date.now();
      const asset: TeacherAsset = {
        id: nanoid(10),
        type: 'interactive-html',
        title: topic.trim().slice(0, 60),
        status: 'ready',
        createdAt: now,
        updatedAt: now,
        ref: {},
      };
      saveAsset(asset);
      toast.success(t('teacher.interactiveHtml.success'));
    } catch (err) {
      log.error('generate failed:', err);
      toast.error(t('teacher.interactiveHtml.error.generate'));
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!html) return;
    try {
      await navigator.clipboard.writeText(html);
      toast.success(t('teacher.interactiveHtml.copied'));
    } catch {
      toast.error(t('teacher.interactiveHtml.error.copy'));
    }
  };

  const handleDownload = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interactive-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('teacher.interactiveHtml.topic')}>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Field>
        <Field label={t('teacher.interactiveHtml.audience')}>
          <Input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder={t('teacher.interactiveHtml.audiencePlaceholder')}
          />
        </Field>
        <Field label={t('teacher.interactiveHtml.goal')} full>
          <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} />
        </Field>
        <Field label={t('teacher.interactiveHtml.interactionType')} full>
          <Input
            value={interactionType}
            onChange={(e) => setInteractionType(e.target.value)}
            placeholder={t('teacher.interactiveHtml.interactionTypePlaceholder')}
          />
        </Field>
        <Field label={t('teacher.interactiveHtml.constraints')} full>
          <Textarea
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            rows={2}
            placeholder={t('teacher.interactiveHtml.constraintsPlaceholder')}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleSubmit} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('teacher.interactiveHtml.generating')}
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              {t('teacher.interactiveHtml.generate')}
            </>
          )}
        </Button>
      </div>

      {html && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {t('teacher.interactiveHtml.preview')}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-muted/60"
              >
                <Copy className="size-3.5" />
                {t('teacher.interactiveHtml.copy')}
              </button>
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-muted/60"
              >
                <Download className="size-3.5" />
                {t('teacher.interactiveHtml.download')}
              </button>
            </div>
          </div>
          <iframe
            title={t('teacher.interactiveHtml.preview')}
            sandbox="allow-scripts"
            srcDoc={html}
            className="w-full h-[520px] rounded-md border border-border/60 bg-white"
          />
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
