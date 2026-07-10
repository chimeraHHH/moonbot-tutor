import { beforeEach, describe, expect, it, vi } from "vitest";
import createClient from "openapi-fetch";
import type { paths } from "@/lib/api-types";
import { API_BASE } from "@/lib/api";

describe("api client", () => {
  it("uses the configured backend base url", () => {
    // NEXT_PUBLIC_API_URL unset in test env → dev default.
    expect(API_BASE).toBe("http://localhost:8088");
  });

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
  });

  // Inject the mock fetch directly (openapi-fetch resolves fetch internally,
  // so stubbing the global does not reliably intercept it).
  const makeClient = () =>
    createClient<paths>({ baseUrl: API_BASE, fetch: fetchMock });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  /** openapi-fetch may pass either (string, init) or a single Request. */
  const lastCall = async () => {
    const arg = fetchMock.mock.calls[0][0];
    if (arg instanceof Request) {
      return { url: arg.url, method: arg.method, body: await arg.text() };
    }
    const init = (fetchMock.mock.calls[0][1] ?? {}) as Record<string, unknown>;
    return {
      url: arg as string,
      method: init.method as string,
      body: String(init.body ?? ""),
    };
  };

  it("POST /api/v1/tasks with the openapi-derived body shape", async () => {
    fetchMock.mockResolvedValue(
      json({ taskId: "t-1", status: "queued", stages: [] }, 202),
    );
    const { data, error } = await makeClient().POST("/api/v1/tasks", {
      body: { question: "chain rule" },
    });
    expect(error).toBeUndefined();
    expect(data?.taskId).toBe("t-1");

    const { url, method, body } = await lastCall();
    expect(url).toBe(`${API_BASE}/api/v1/tasks`);
    expect(method).toBe("POST");
    expect(JSON.parse(body)).toEqual({ question: "chain rule" });
  });

  it("GET /api/v1/tasks/{taskId} with the path param", async () => {
    fetchMock.mockResolvedValue(
      json({
        taskId: "t-9",
        status: "running",
        stage: "code",
        progress: 0.5,
        videoUrl: null,
        error: null,
      }),
    );
    const { data } = await makeClient().GET("/api/v1/tasks/{taskId}", {
      params: { path: { taskId: "t-9" } },
    });
    expect(data?.taskId).toBe("t-9");
    const { url } = await lastCall();
    expect(url).toBe(`${API_BASE}/api/v1/tasks/t-9`);
  });
});
