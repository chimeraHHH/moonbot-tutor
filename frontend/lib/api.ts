import createClient from "openapi-fetch";
import type { paths } from "./api-types";

/** Backend base URL. Inlined at build time (NEXT_PUBLIC_*). */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8088";

/** Typed REST client derived from openapi.yaml (see `npm run gen:api`). */
export const api = createClient<paths>({ baseUrl: API_BASE });

export type TaskStatus = {
  taskId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  stage: string | null;
  progress: number;
  videoUrl: string | null;
  error: string | null;
};
