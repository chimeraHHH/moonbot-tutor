# Real-Time Tutor

An AI-powered interactive classroom platform. Turn any topic or document into a
multi-agent lesson — slides, quizzes, interactive simulations, and step-by-step
**Deep Solve** explainer videos rendered with Manim.

## Structure

- **App** (Next.js, repo root) — classroom generation, multi-agent playback, TTS/whiteboard, export.
- **`services/code2video/`** — the **Deep Solve** backend (Code2Video / Manim): a
  single FastAPI service (one port, `:8010`) that turns a problem into a narrated
  Manim explainer video via a 7-stage pipeline. It also hosts the LLM shim and TTS
  in-process, so the whole stack runs on one port. The app calls it as a video
  provider through `VIDEO_DEEPSOLVE_BASE_URL`.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # fill in at least one LLM provider key
pnpm dev
```

### Enabling Deep Solve (Manim) videos

The backend is a **single process on one port** (`:8010`) — pipeline + LLM shim +
TTS folded together. It reads its LLM key from `.env.local` at runtime.

One-time setup (macOS):

```bash
brew install pkg-config pango ffmpeg
python3.12 -m venv services/code2video/.venv
source services/code2video/.venv/bin/activate
pip install -r services/code2video/src/requirements.txt
```

Then:

1. Start the backend (single command, single port):
   ```bash
   ./services/code2video/start-backend.sh
   ```
2. In `.env.local` set `VIDEO_DEEPSOLVE_BASE_URL=http://localhost:8010` and leave
   other `VIDEO_*` providers unset so Deep Solve is used for explainer videos.
3. `pnpm dev`, then generate a classroom with video generation enabled — STEM
   scenes are produced as Manim explainer videos and embedded as slide videos.

> The backend picks up the LLM from `C2V_LLM_*` env (the launch script defaults to
> the app's `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL` via the built-in OpenAI↔Anthropic
> shim). Code-gen quality varies by topic/model; a stronger model renders more
> reliably than the Haiku default.

## License

Based on the [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) platform. MIT licensed — see [LICENSE](LICENSE).
