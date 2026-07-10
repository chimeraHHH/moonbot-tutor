"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, API_BASE, type TaskStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const STAGES = [
  "llm1",
  "llm2",
  "storyboard",
  "audio",
  "code",
  "render",
  "merge",
] as const;

export default function Home() {
  const [question, setQuestion] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const stop = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (sseRef.current) sseRef.current.close();
    pollRef.current = null;
    sseRef.current = null;
  }, []);

  useEffect(() => () => stop(), [stop]);

  const refresh = useCallback(
    async (id: string) => {
      const { data, error } = await api.GET("/api/v1/tasks/{taskId}", {
        params: { path: { taskId: id } },
      });
      if (error || !data) return;
      setStatus(data as TaskStatus);
      if (data.status === "succeeded" || data.status === "failed") {
        stop();
        setBusy(false);
      }
    },
    [stop],
  );

  const watch = useCallback(
    (id: string) => {
      // Primary: SSE pushes a wake-up → poll the canonical status.
      const es = new EventSource(`${API_BASE}/api/v1/tasks/${id}/events`);
      es.onmessage = () => refresh(id);
      es.onerror = () => {
        // SSE failed/closed — let the polling fallback take over.
        es.close();
      };
      sseRef.current = es;
      // Fallback: poll every 3s regardless.
      pollRef.current = setInterval(() => refresh(id), 3000);
    },
    [refresh],
  );

  const submit = useCallback(async () => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setStatus(null);
    const { data, error } = await api.POST("/api/v1/tasks", {
      body: { question },
    });
    if (error || !data) {
      setStatus({
        taskId: "",
        status: "failed",
        stage: null,
        progress: 0,
        videoUrl: null,
        error: "Failed to create task.",
      });
      setBusy(false);
      return;
    }
    const id = (data as { taskId: string }).taskId;
    setTaskId(id);
    await refresh(id);
    watch(id);
  }, [question, busy, refresh, watch]);

  const videoSrc = status?.videoUrl
    ? status.videoUrl
    : status?.status === "succeeded" && taskId
      ? `${API_BASE}/api/v1/tasks/${taskId}/video`
      : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Moonbot Tutor</h1>
      <p className="text-sm text-neutral-500">
        Ask a question — get a narrated Manim explainer video.
      </p>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Explain the chain rule"
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !question.trim()}>
              {busy ? "Working…" : "Generate"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {status && (
        <Card>
          <CardHeader>
            <CardTitle>
              {status.status === "succeeded"
                ? "Video ready"
                : status.status === "failed"
                  ? "Failed"
                  : `Generating… ${status.stage ? `(${status.stage})` : ""}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Progress value={status.progress} />
            <ol className="flex flex-wrap gap-2 text-xs">
              {STAGES.map((s) => (
                <li
                  key={s}
                  className={
                    status.stage === s
                      ? "rounded bg-neutral-900 px-2 py-1 text-neutral-50 dark:bg-neutral-50 dark:text-neutral-900"
                      : "rounded bg-neutral-200 px-2 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }
                >
                  {s}
                </li>
              ))}
            </ol>
            {status.error && (
              <p className="text-sm text-red-600">{status.error}</p>
            )}
            {videoSrc && (
              <video
                key={videoSrc}
                src={videoSrc}
                controls
                className="w-full rounded-md border border-neutral-200 dark:border-neutral-800"
              />
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
