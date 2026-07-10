#!/usr/bin/env sh
set -eu

PY=python3
ENTRY=agent.py

# 1) Default values and constants
# -------------------------------------------------------------

# Common defaults (if not overridden by command line)
API="gpt-41"
FOLDER_PREFIX="TEST-single"

# Hyperparameters
MAX_CODE_TOKEN_LENGTH=10000
MAX_FIX_BUG_TRIES=10
MAX_REGENERATE_TRIES=10
MAX_FEEDBACK_GEN_CODE_TRIES=3
MAX_MLLM_FIX_BUGS_TRIES=3
FEEDBACK_ROUNDS=2

# 2) KNOWLEDGE_POINT
# -------------------------------------------------------------

DEFAULT_KNOWLEDGE_POINT="Linear transformations and matrices"
KNOWLEDGE_POINT_ARGS=""
if ! echo "$@" | grep -q -- "--knowledge_point"; then
  KNOWLEDGE_POINT_ARGS="--knowledge_point \"$DEFAULT_KNOWLEDGE_POINT\""
  echo "INFO: Using default knowledge point: $DEFAULT_KNOWLEDGE_POINT"
fi

# 3) execute
# -------------------------------------------------------------

exec "$PY" "$ENTRY" \
  --API "$API" \
  --folder_prefix "$FOLDER_PREFIX" \
  --use_feedback \
  --use_assets \
  --max_code_token_length "$MAX_CODE_TOKEN_LENGTH" \
  --max_fix_bug_tries "$MAX_FIX_BUG_TRIES" \
  --max_regenerate_tries "$MAX_REGENERATE_TRIES" \
  --max_feedback_gen_code_tries "$MAX_FEEDBACK_GEN_CODE_TRIES" \
  --max_mllm_fix_bugs_tries "$MAX_MLLM_FIX_BUGS_TRIES" \
  --feedback_rounds "$FEEDBACK_ROUNDS" \
  --parallel \
  $KNOWLEDGE_POINT_ARGS \
  "$@"
