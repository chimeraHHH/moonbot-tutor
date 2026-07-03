#!/usr/bin/env sh
set -eu

PY=python3
ENTRY=agent.py

# Common defaults
# choices=["gpt-41", "claude", "gpt-5", "gpt-4o", "gpt-o4mini", "Gemini"]
API="gpt-41"
FOLDER_PREFIX="TEST-LIST"

# Hyperparameters
MAX_CODE_TOKEN_LENGTH=10000
MAX_FIX_BUG_TRIES=10
MAX_REGENERATE_TRIES=10
MAX_FEEDBACK_GEN_CODE_TRIES=3
MAX_MLLM_FIX_BUGS_TRIES=3
FEEDBACK_ROUNDS=2
PARALLEL_GROUP_NUM=3
KNOWLEDGE_FILE="long_video_topics_list.json"
MAX_CONCEPTS=-1

# 3) Multi-learning topic mode
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
  --parallel_group_num "$PARALLEL_GROUP_NUM" \
  --knowledge_file "$KNOWLEDGE_FILE" \
  --max_concepts "$MAX_CONCEPTS" \
  "$@"
