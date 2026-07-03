# Real-Time Tutor

An AI-powered interactive classroom platform. Turn any topic or document into a
multi-agent lesson — slides, quizzes, interactive simulations, and step-by-step
**Deep Solve** explainer videos rendered with Manim.

## Structure

- **App** (Next.js, repo root) — classroom generation, multi-agent playback, TTS/whiteboard, export.
- **`services/code2video/`** — the **Deep Solve** backend (Code2Video / Manim): a
  FastAPI service that turns a problem into a narrated Manim explainer video via a
  7-stage pipeline. The app calls it as a video provider through
  `VIDEO_DEEPSOLVE_BASE_URL`.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # fill in at least one LLM provider key
pnpm dev
```

### Enabling Deep Solve (Manim) videos

1. Run the backend in `services/code2video/` (needs Python, Manim, FFmpeg and a TTS
   service). It listens on `http://localhost:8010` by default.
2. Set `VIDEO_DEEPSOLVE_BASE_URL=http://localhost:8010` in `.env.local` and leave
   other `VIDEO_*` providers unset so Deep Solve is used for explainer videos.
3. Generate a classroom with video generation enabled — STEM scenes will be
   produced as Manim explainer videos and embedded as slide video elements.

## License

Based on the [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) platform. MIT licensed — see [LICENSE](LICENSE).
