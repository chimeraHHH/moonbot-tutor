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

# --- LLM config (read Anthropic key/base from .env.local) --------------------
read_env() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'; }
ANTHROPIC_KEY="$(read_env ANTHROPIC_API_KEY)"
ANTHROPIC_BASE="$(read_env ANTHROPIC_BASE_URL)"
C2V_PROVIDER_FILE="$(read_env C2V_LLM_PROVIDER)"
C2V_MODEL_FILE="$(read_env C2V_LLM_MODEL)"
C2V_FIX_MODEL_FILE="$(read_env C2V_FIX_MODEL)"
C2V_KEY_FILE="$(read_env C2V_LLM_API_KEY)"
C2V_BASE_FILE="$(read_env C2V_LLM_BASE_URL)"

export C2V_LLM_PROVIDER="${C2V_LLM_PROVIDER:-${C2V_PROVIDER_FILE:-claude}}"
export C2V_LLM_MODEL="${C2V_LLM_MODEL:-${C2V_MODEL_FILE:-claude-sonnet-5}}"
# Fix/repair loop uses a faster model (code generation keeps C2V_LLM_MODEL).
export C2V_FIX_MODEL="${C2V_FIX_MODEL:-${C2V_FIX_MODEL_FILE:-$C2V_LLM_MODEL}}"
export C2V_LLM_API_KEY="${C2V_LLM_API_KEY:-${C2V_KEY_FILE:-$ANTHROPIC_KEY}}"
export C2V_LLM_BASE_URL="${C2V_LLM_BASE_URL:-${C2V_BASE_FILE:-http://localhost:8010/shim/v1}}"
export C2V_TTS_URL="${C2V_TTS_URL:-http://localhost:8010}"
# Manim voiceover narration → Doubao TTS 2.0 ("appId:accessKey"). Shared with
# OpenMAIC's TTS_DOUBAO_API_KEY. Unset ⇒ the manim side falls back to edge-tts.
export C2V_TTS_DOUBAO_KEY="${C2V_TTS_DOUBAO_KEY:-$(read_env TTS_DOUBAO_API_KEY)}"
[ -n "$(read_env C2V_TTS_VOICE)" ] && export C2V_TTS_VOICE="$(read_env C2V_TTS_VOICE)"
# The shim forwards to the Anthropic-native upstream (…/messages).
if [ -n "$ANTHROPIC_BASE" ]; then
  export C2V_SHIM_UPSTREAM="${C2V_SHIM_UPSTREAM:-${ANTHROPIC_BASE%/}/messages}"
fi

# Keep the operator's proxy for remote providers such as Vertex AI. Loopback
# traffic (the Nest bridge, the local TTS endpoint, and the optional Anthropic
# shim) is excluded explicitly so it never gets routed through that proxy.
HTTP_PROXY_FILE="$(read_env HTTP_PROXY)"
HTTPS_PROXY_FILE="$(read_env HTTPS_PROXY)"
NO_PROXY_FILE="$(read_env NO_PROXY)"
[ -n "$HTTP_PROXY_FILE" ] && export HTTP_PROXY="${HTTP_PROXY:-$HTTP_PROXY_FILE}"
[ -n "$HTTPS_PROXY_FILE" ] && export HTTPS_PROXY="${HTTPS_PROXY:-$HTTPS_PROXY_FILE}"
export http_proxy="${http_proxy:-${HTTP_PROXY:-}}"
export https_proxy="${https_proxy:-${HTTPS_PROXY:-}}"
export NO_PROXY="${NO_PROXY:-${NO_PROXY_FILE:-localhost,127.0.0.1}},0.0.0.0"
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

echo "▶ Deep Solve backend on :${PORT:-8010}  (pipeline + LLM shim + TTS)"
cd "$SCRIPT_DIR/src"
exec python deep_solve_bridge.py
