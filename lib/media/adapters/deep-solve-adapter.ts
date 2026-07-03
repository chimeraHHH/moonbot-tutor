/**
 * Deep Solve (Code2Video / Manim) Video Generation Adapter
 *
 * Bridges OpenMAIC's video-generation interface to the Sophos "Code2Video"
 * deep-solve pipeline (`deep_solve_bridge.py`, default port 8010). Unlike the
 * commercial text-to-video providers, deep-solve takes a *problem or topic* and
 * runs a 7-stage pipeline (llm1 → llm2 → storyboard → audio → code → render →
 * merge) that renders a step-by-step Manim explainer video.
 *
 * Async task pattern: submit task → poll status until terminal → download MP4.
 *   POST {base}/api/v1/deep-solve/tasks            → { task_id, ... }
 *   GET  {base}/api/v1/deep-solve/tasks/{id}       → { state, artifacts, ... }
 *   GET  {base}/api/v1/deep-solve/tasks/{id}/video → the merged MP4 (added for
 *                                                    this integration)
 *
 * `config.baseUrl` is the bridge root (from VIDEO_DEEPSOLVE_BASE_URL). The
 * provider is keyless — `config.apiKey` may be empty; the bridge resolves its
 * own LLM runtime from its `SOLVE_*` env unless passthrough runtime env is set
 * (VIDEO_DEEPSOLVE_LLM_API_KEY / _BASE_URL / _MODEL / _PROVIDER).
 */

import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';

const DEFAULT_BASE_URL = 'http://localhost:8010';
const API_PREFIX = '/api/v1/deep-solve';

// Manim rendering is far slower than commercial T2V: allow a long budget.
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 360; // 360 × 5s = 30 min

// Bridge renders with `-ql` (480p15). At 16:9 that is 854×480.
const RENDER_WIDTH = 854;
const RENDER_HEIGHT = 480;

function rootUrl(config: VideoGenerationConfig): string {
  return (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/** Optional LLM runtime passthrough — omitted when unset so the bridge uses its own env. */
function buildRuntime(): Record<string, string> | undefined {
  const apiKey = process.env.VIDEO_DEEPSOLVE_LLM_API_KEY;
  const baseUrl = process.env.VIDEO_DEEPSOLVE_LLM_BASE_URL;
  const model = process.env.VIDEO_DEEPSOLVE_LLM_MODEL;
  const provider = process.env.VIDEO_DEEPSOLVE_LLM_PROVIDER;
  const runtime: Record<string, string> = {};
  if (apiKey) runtime.api_key = apiKey;
  if (baseUrl) runtime.base_url = baseUrl;
  if (model) runtime.model = model;
  if (provider) runtime.provider = provider;
  return Object.keys(runtime).length > 0 ? runtime : undefined;
}

interface DeepSolveCreateResponse {
  task_id: string;
}

interface DeepSolveArtifact {
  kind: string;
  path: string;
  url?: string | null;
}

interface DeepSolveStatus {
  task_id: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | string;
  artifacts?: DeepSolveArtifact[];
  error?: { message?: string } | null;
}

/**
 * Submit a deep-solve task. `options.prompt` is used as the problem/topic
 * ("question"); `options.style`-like context isn't part of the video options,
 * so context is left empty here (callers may enrich it later).
 */
export async function submitDeepSolveTask(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<string> {
  const base = rootUrl(config);
  const body: Record<string, unknown> = {
    engine: 'code2video',
    input: { question: options.prompt, context: '' },
  };
  const runtime = buildRuntime();
  if (runtime) body.runtime = runtime;

  const response = await fetch(`${base}${API_PREFIX}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Deep Solve task submission failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as DeepSolveCreateResponse;
  if (!data.task_id) {
    throw new Error('Deep Solve returned empty task_id');
  }
  return data.task_id;
}

/**
 * Poll a deep-solve task once. Returns a result when succeeded, null while still
 * running/queued, and throws on failure/cancellation.
 */
export async function pollDeepSolveTask(
  config: VideoGenerationConfig,
  taskId: string,
): Promise<VideoGenerationResult | null> {
  const base = rootUrl(config);
  const response = await fetch(`${base}${API_PREFIX}/tasks/${taskId}`, { method: 'GET' });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Deep Solve poll failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as DeepSolveStatus;

  if (data.state === 'succeeded') {
    const finalArtifact = data.artifacts?.find((a) => a.kind === 'final_video');
    if (!finalArtifact) {
      throw new Error('Deep Solve succeeded but no final_video artifact was returned');
    }
    // Prefer the bridge-provided URL; otherwise construct the download route.
    const url = finalArtifact.url || `${base}${API_PREFIX}/tasks/${taskId}/video`;
    return {
      url,
      duration: 0,
      width: RENDER_WIDTH,
      height: RENDER_HEIGHT,
    };
  }

  if (data.state === 'failed' || data.state === 'cancelled') {
    throw new Error(
      `Deep Solve task ${data.state}: ${data.error?.message || 'no error detail'}`,
    );
  }

  // queued or running
  return null;
}

/**
 * Generate a Manim explainer video via the deep-solve pipeline:
 * submit task + poll until complete. Returns a URL OpenMAIC's media pipeline
 * downloads and localizes.
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
 * Lightweight connectivity test — hits the bridge root ("/"). A 2xx means the
 * service is reachable; the deep-solve pipeline needs no API key.
 */
export async function testDeepSolveConnectivity(
  config: VideoGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const base = rootUrl(config);
  try {
    const response = await fetch(`${base}/`, { method: 'GET' });
    if (!response.ok) {
      return { success: false, message: `Deep Solve bridge returned ${response.status}` };
    }
    return { success: true, message: 'Connected to Deep Solve bridge' };
  } catch (err) {
    return { success: false, message: `Deep Solve connectivity error: ${err}` };
  }
}
