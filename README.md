# moonbot-tutor

AI-driven teaching tool: a chat frontend that turns a question/topic into a
narrated **Manim explainer video**.

Built on top of the [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) idea and
its `real-time-tutor` fork — but stripped down to the essentials: one user
dialog + auto-generated Manim. Everything else (multi-agent classroom,
whiteboard, TTS/ASR, PBL, auth, the 16-provider config sprawl) is removed.

## Architecture

```
Chat frontend (later)
        │  REST (openapi.yaml)
        ▼
┌───────────────────────┐        ┌──────────────────────────────┐
│  backend/  (NestJS,TS)│ ─────► │  services/code2video (FastAPI)│
│  BFF / forwarding     │  HTTP  │  7-stage Manim pipeline       │
└───────────────────────┘        └──────────────────────────────┘
```

- **`backend/`** — NestJS (TypeScript + Vitest + npm). Thin BFF that exposes
  `openapi.yaml` and forwards to the FastAPI service.
- **`services/code2video/`** — FastAPI "Deep Solve" pipeline
  (`llm1 → llm2 → storyboard → audio → code → render → merge`). Ported from
  `real-time-tutor/services/code2video` (placeholder for now).
- **LLM**: Claude via `byteswarm.ai` relay. **TTS**: Doubao. **Manim**: ManimCE.

## Layout

```
backend/                 NestJS BFF (TS + Vitest + npm)
services/code2video/     FastAPI Manim service (placeholder)
openapi.yaml             the API contract
docker-compose.yml       orchestration
.github/workflows/       CI/CD (build → test → GHCR → SSH deploy)
```

## Develop (backend)

```bash
cd backend
npm install
npm run start:dev   # http://localhost:3000
npm test
```

## Required GitHub secrets (for CI/CD deploy)

- `SERVER_HOST` — `82.157.189.119`
- `SERVER_USER` — SSH user (e.g. `root`)
- `SERVER_PASSWORD` — SSH password

(`GITHUB_TOKEN` is provided automatically for GHCR push/pull.)

## Status

Skeleton only — real API implementation and the chat frontend come next.
