# OpenMAIC Frontend Port — Design

Date: 2026-07-10. Status: approved (forks decided), executing Phase 1.

## Goal
Make the OpenMAIC **interactive classroom frontend** (topic → generated slides/quiz/interactive scenes with real-time TTS + whiteboard + playback) the main app. Manim video generation becomes one capability the generation agent uses, called through our **openapi** backend. Every generated classroom gets **exactly one Manim video in its back half**, driven by a prompt (not hardcoded).

## Architecture (Option A — approved)
- **`frontend/`** = ported OpenMAIC Next.js app (frontend **+ its own generation server** in `app/api` + `lib/`). Replaces the minimal chat frontend.
- **NestJS backend** = unchanged, the code2video BFF, authoritative per `openapi.yaml`.
- OpenMAIC's existing `deep-solve` video provider (`lib/media/adapters/deep-solve-adapter.ts`) is **rewired to our openapi** (`POST /api/v1/tasks` → poll/SSE → `/video`) instead of code2video `:8010` directly.
- LLM hardwired to **DeepSeek** (OpenAI-compatible) — `DEFAULT_MODEL=deepseek:deepseek-chat` + `DEEPSEEK_API_KEY`. All multi-provider config UI/registry collapsed.

## Decisions (forks)
1. Live multi-agent chat (LangGraph `/api/chat`, chat/roundtable/whiteboard UI) — **dropped** for now.
2. Scene types — **keep all** (slide, quiz, interactive; PBL kept in-tree).
3. Back-half-one-video rule — **prompt-based**, in a dedicated Manim prompt snippet file (maintainable), not code-enforced.

## Phases (each: spec slice → TDD where new logic → build)
- **Phase 1 — Port + strip + hardwire**: copy `real-time-tutor/` → `frontend/`; strip dropped features; hardwire DeepSeek. Exit: topic → interactive classroom with TTS plays.
- **Phase 2 — Manim via openapi (TDD)**: rewire `deep-solve` adapter to the openapi client; test against spec.
- **Phase 3 — Video prompt (TDD)**: add Manim prompt snippet file instructing "exactly one video, back half"; test the prompt assembly includes it.

## Strip list (Phase 1)
Drop: `lib/orchestration/` + `app/api/chat/` + chat/roundtable/whiteboard/agent UI (live chat); `components/settings/` provider UI; `app/api/server-providers/`, `app/api/verify-*`; collapse `lib/ai/providers.ts` + `lib/server/{model-routes,ssrf-guard,provider-config}.ts` + thinking-* machinery. Leave auth/admin/access-code code present but disabled (no `AUTH_ENABLED`/`DATABASE_URL`) to minimize surgery.

## TDD scope
New/changed logic only: Phase 2 openapi client, Phase 3 prompt assembly. Ported generation/playback is existing code (verified by running, not rewritten under TDD).

## Open question (non-blocking)
PBL kept in-tree but its heavy agent runtime may need env/stages later; not exercised in Phase 1.
