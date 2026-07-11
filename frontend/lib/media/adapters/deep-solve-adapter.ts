/**
 * Deep Solve (Code2Video / Manim) Video Generation Adapter
 *
 * Bridges OpenMAIC's video-generation interface to the NestJS BFF, which is the
 * authoritative surface defined in the repo root `openapi.yaml` and forwards to
 * the code2video (Deep Solve) Manim pipeline. The frontend talks ONLY to the
 * BFF's openapi — never to code2video directly.
 *
 * Async task pattern (openapi): submit → poll until terminal → resolve mp4 URL.
 *   POST {base}/api/v1/tasks            202 → { taskId, status, stages }
 *   GET  {base}/api/v1/tasks/{id}       200 → { status, stage, progress, videoUrl, error }
 *   GET  {base}/api/v1/tasks/{id}/video 200 → the merged MP4
 *   GET  {base}/health                  200 → { status: ok }
 *
 * `config.baseUrl` is the BFF root (from VIDEO_DEEPSOLVE_BASE_URL). The BFF is
 * keyless from the frontend's perspective — it resolves the code2video LLM from
 * its own env.
 */

import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';

const DEFAULT_BASE_URL = 'http://localhost:8088';

// Manim rendering is far slower than commercial T2V: allow a long budget.
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 360; // 360 × 5s = 30 min

// The pipeline renders with `-ql` (480p15). At 16:9 that is 854×480.
const RENDER_WIDTH = 854;
const RENDER_HEIGHT = 480;

type TaskState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

interface CreateTaskResponse {
  taskId: string;
  status: TaskState | string;
}

interface TaskStatusResponse {
  taskId: string;
  status: TaskState | string;
  stage?: string | null;
  progress?: number;
  videoUrl?: string | null;
  error?: string | null;
}

function rootUrl(config: VideoGenerationConfig): string {
  return (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * Submit a task via the BFF. `options.prompt` is used as the question/topic.
 */
export async function submitDeepSolveTask(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<string> {
  const base = rootUrl(config);
  const response = await fetch(`${base}/api/v1/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: options.prompt, context: '' }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Deep Solve task submission failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as CreateTaskResponse;
  if (!data.taskId) {
    throw new Error('Deep Solve returned empty taskId');
  }
  return data.taskId;
}

/**
 * Poll a task once via the BFF. Returns a result when succeeded, null while
 * still running/queued, and throws on failure/cancellation.
 */
export async function pollDeepSolveTask(
  config: VideoGenerationConfig,
  taskId: string,
): Promise<VideoGenerationResult | null> {
  const base = rootUrl(config);
  const response = await fetch(`${base}/api/v1/tasks/${taskId}`, { method: 'GET' });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Deep Solve poll failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as TaskStatusResponse;

  if (data.status === 'succeeded') {
    const url = data.videoUrl || `${base}/api/v1/tasks/${taskId}/video`;
    return { url, duration: 0, width: RENDER_WIDTH, height: RENDER_HEIGHT };
  }

  if (data.status === 'failed' || data.status === 'cancelled') {
    throw new Error(`Deep Solve task ${data.status}: ${data.error || 'no error detail'}`);
  }

  // queued or running
  return null;
}

/**
 * Generate a Manim explainer video via the BFF: submit + poll until complete.
 * Returns a URL OpenMAIC's media pipeline downloads and localizes.
 */
export async function generateWithDeepSolve(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  const taskId = await submitDeepSolveTask(config, options);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const result = await pollDeepSolveTask(config, taskId);
    if (result) return result;
  }

  throw new Error(
    `Deep Solve generation timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s (task: ${taskId})`,
  );
}

/**
 * Connectivity test — hits the BFF health endpoint.
 */
export async function testDeepSolveConnectivity(
  config: VideoGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const base = rootUrl(config);
  try {
    const response = await fetch(`${base}/health`, { method: 'GET' });
    if (!response.ok) {
      return { success: false, message: `BFF returned ${response.status}` };
    }
    return { success: true, message: 'Connected to BFF (Deep Solve)' };
  } catch (err) {
    return { success: false, message: `BFF connectivity error: ${err}` };
  }
}
