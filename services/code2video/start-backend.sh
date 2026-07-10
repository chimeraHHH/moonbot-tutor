#!/usr/bin/env bash
# Start the Deep Solve backend as a SINGLE process/port (:8010).
# It serves the deep-solve pipeline + the LLM shim + TTS, so nothing else needs
# to run. The LLM key is read from the app's .env.local at runtime (never stored
# here).
#
# Setup once:
#   python3.12 -m venv services/code2video/.venv
#   source services/code2video/.venv/bin/activate
#   pip install -r services/code2video/src/requirements.txt fastapi uvicorn edge-tts mutagen
#   (macOS also needs: brew install pkg-config pango ffmpeg)
#
# Run:
#   ./services/code2video/start-backend.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

# --- LLM config (read Anthropic key/base + optional C2V overrides) -----------
# Safe under `set -euo pipefail`: missing keys return empty string, never non-zero.
read_env() { { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'; } || true; }
ANTHROPIC_KEY="$(read_env ANTHROPIC_API_KEY)"
ANTHROPIC_BASE="$(read_env ANTHROPIC_BASE_URL)"
# Optional overrides in .env.local (take precedence over defaults / derived values).
ENV_C2V_LLM_PROVIDER="$(read_env C2V_LLM_PROVIDER)"
ENV_C2V_LLM_MODEL="$(read_env C2V_LLM_MODEL)"
ENV_C2V_FIX_MODEL="$(read_env C2V_FIX_MODEL)"
ENV_C2V_SHIM_UPSTREAM="$(read_env C2V_SHIM_UPSTREAM)"
ENV_C2V_LLM_BASE_URL="$(read_env C2V_LLM_BASE_URL)"
ENV_C2V_LLM_API_KEY="$(read_env C2V_LLM_API_KEY)"
ENV_HTTPS_PROXY="$(read_env HTTPS_PROXY)"

# Precedence per var: existing shell env > .env.local > default.
export C2V_LLM_PROVIDER="${C2V_LLM_PROVIDER:-${ENV_C2V_LLM_PROVIDER:-claude}}"
export C2V_LLM_MODEL="${C2V_LLM_MODEL:-${ENV_C2V_LLM_MODEL:-claude-sonnet-5}}"
# Fix/repair loop uses a faster model (code generation keeps C2V_LLM_MODEL).
export C2V_FIX_MODEL="${C2V_FIX_MODEL:-${ENV_C2V_FIX_MODEL:-claude-haiku-4-5-20251001}}"
export C2V_LLM_API_KEY="${C2V_LLM_API_KEY:-${ENV_C2V_LLM_API_KEY:-$ANTHROPIC_KEY}}"
export C2V_LLM_BASE_URL="${C2V_LLM_BASE_URL:-${ENV_C2V_LLM_BASE_URL:-http://localhost:8010/shim/v1}}"
export C2V_TTS_URL="${C2V_TTS_URL:-http://localhost:8010}"
# Manim voiceover narration → Doubao TTS 2.0 ("appId:accessKey"). Shared with
# OpenMAIC's TTS_DOUBAO_API_KEY. Unset ⇒ the manim side falls back to edge-tts.
export C2V_TTS_DOUBAO_KEY="${C2V_TTS_DOUBAO_KEY:-$(read_env TTS_DOUBAO_API_KEY)}"
[ -n "$(read_env C2V_TTS_VOICE)" ] && export C2V_TTS_VOICE="$(read_env C2V_TTS_VOICE)"
# Shim upstream: prefer explicit .env.local override, else derive from ANTHROPIC_BASE_URL.
if [ -n "${C2V_SHIM_UPSTREAM:-}" ]; then
  : # already set in shell env
elif [ -n "$ENV_C2V_SHIM_UPSTREAM" ]; then
  export C2V_SHIM_UPSTREAM="$ENV_C2V_SHIM_UPSTREAM"
elif [ -n "$ANTHROPIC_BASE" ]; then
  export C2V_SHIM_UPSTREAM="${ANTHROPIC_BASE%/}/messages"
fi

# Keep a proxy available for outbound LLM traffic (e.g. Vertex behind GFW), but
# route localhost calls (shim/TTS on :8010) around it via NO_PROXY. The Python
# clients also honor these envs when constructing httpx transports.
unset ALL_PROXY all_proxy || true
if [ -n "${HTTPS_PROXY:-}" ]; then
  : # respect existing shell env
elif [ -n "$ENV_HTTPS_PROXY" ]; then
  export HTTPS_PROXY="$ENV_HTTPS_PROXY"
  export HTTP_PROXY="${HTTP_PROXY:-$ENV_HTTPS_PROXY}"
else
  unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy || true
fi
export NO_PROXY="127.0.0.1,localhost,0.0.0.0"
export no_proxy="$NO_PROXY"

# --- Python env --------------------------------------------------------------
VENV="${C2V_VENV:-$SCRIPT_DIR/.venv}"
if [ -f "$VENV/bin/activate" ]; then
  # shellcheck disable=SC1091
  source "$VENV/bin/activate"
fi
if ! python -c "import manim" >/dev/null 2>&1; then
  echo "⚠️  manim not found. Create the venv and install deps (see header)." >&2
fi
[ -n "$C2V_LLM_API_KEY" ] || echo "⚠️  No LLM key (ANTHROPIC_API_KEY missing in .env.local)." >&2

# --- Safe config log (never print key contents) ------------------------------
if [ -n "${C2V_LLM_API_KEY:-}" ]; then LLM_KEY_STATUS="set"; else LLM_KEY_STATUS="missing"; fi
echo "── Deep Solve LLM config ──"
echo "  C2V_LLM_PROVIDER : $C2V_LLM_PROVIDER"
echo "  C2V_LLM_MODEL    : $C2V_LLM_MODEL"
echo "  C2V_FIX_MODEL    : $C2V_FIX_MODEL"
echo "  C2V_LLM_BASE_URL : $C2V_LLM_BASE_URL"
echo "  C2V_SHIM_UPSTREAM: ${C2V_SHIM_UPSTREAM:-<unset>}"
echo "  C2V_LLM_API_KEY  : $LLM_KEY_STATUS"
echo "  HTTPS_PROXY      : ${HTTPS_PROXY:-<unset>}"
echo "───────────────────────────"

echo "▶ Deep Solve backend on :${PORT:-8010}  (pipeline + LLM shim + TTS)"
cd "$SCRIPT_DIR/src"
exec python deep_solve_bridge.py
