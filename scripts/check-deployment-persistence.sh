#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workflow="$repo_root/.github/workflows/ci-cd.yml"
frontend_dockerfile="$repo_root/frontend/Dockerfile"
code2video_dockerfile="$repo_root/services/code2video/Dockerfile"
compose_file="$repo_root/docker-compose.yml"

require_text() {
  file="$1"
  expected="$2"
  description="$3"
  if ! grep -Fq -- "$expected" "$file"; then
    echo "deployment persistence check failed: $description" >&2
    echo "missing '$expected' in ${file#"$repo_root/"}" >&2
    exit 1
  fi
}

require_count_at_least() {
  file="$1"
  expected="$2"
  minimum="$3"
  description="$4"
  actual="$(awk -v needle="$expected" 'index($0, needle) { count++ } END { print count + 0 }' "$file")"
  if [ "$actual" -lt "$minimum" ]; then
    echo "deployment persistence check failed: $description" >&2
    echo "expected at least $minimum occurrences of '$expected' in ${file#"$repo_root/"}, found $actual" >&2
    exit 1
  fi
}

require_text "$frontend_dockerfile" 'VOLUME ["/app/data"]' \
  'frontend image must declare its generated-data mount point'
require_text "$code2video_dockerfile" 'VOLUME ["/app/CASES", "/app/src/tts_static"]' \
  'code2video image must declare all generated-output mount points'

for volume in moonbot-frontend-data moonbot-code2video-cases moonbot-code2video-tts; do
  require_text "$workflow" "docker volume create \"\$volume_name\"" \
    'deployment must create named volumes before promotion'
  require_text "$workflow" "initialize_named_volume $volume" \
    "deployment must validate that $volume is writable"
done

require_count_at_least "$workflow" '-v moonbot-frontend-data:/app/data' 2 \
  'both frontend candidate and release must mount persistent data'
require_text "$workflow" '-v moonbot-code2video-cases:/app/CASES' \
  'code2video candidate must mount rendered task outputs'
require_text "$workflow" '-v moonbot-code2video-tts:/app/src/tts_static' \
  'code2video candidate must mount generated TTS outputs'
require_text "$workflow" 'seed_named_volume moonbot-frontend-data moonbot-frontend /app/data' \
  'first rollout must preserve legacy frontend data'
require_text "$workflow" 'seed_named_volume moonbot-code2video-cases moonbot-code2video /app/CASES' \
  'first rollout must preserve legacy rendered videos'
require_text "$workflow" 'seed_named_volume moonbot-code2video-tts moonbot-code2video /app/src/tts_static' \
  'first rollout must preserve legacy generated TTS files'
require_text "$workflow" '| grep -Fqx "$volume_name $source_path"' \
  'legacy sync may be skipped only when the source already uses the canonical volume'
require_text "$workflow" "docker inspect -f '{{.State.Running}}' \"\$source_container\"" \
  'legacy-data migration must not silently skip a stopped source container'
require_text "$workflow" 'set -o pipefail' \
  'legacy-data migration must fail if either side of the tar stream fails'
require_text "$workflow" 'clear_named_volume_contents "$volume_name" "$helper_image"' \
  'legacy migration must replace, not overlay, the authoritative source snapshot'
require_text "$workflow" 'find /target -mindepth 1 -maxdepth 1 ! -name .moonbot-volume-ready' \
  'legacy migration must remove files deleted by the authoritative source'
require_text "$workflow" 'clear_named_volume_contents "$volume_name" "$helper_image" || return 1' \
  'final migration must propagate a failed clear even inside an inverted if condition'
require_text "$workflow" 'node scripts/backfill-classroom-records.mjs' \
  'legacy classroom files must be indexed as ownerless admin-recoverable records'
require_count_at_least "$workflow" 'backfill_classroom_records' 3 \
  'legacy classroom indexing must run initially and again after the final sync'
require_text "$workflow" 'final legacy classroom indexing failed; previous frontend restored' \
  'a final index failure must restore the previous live frontend'
require_text "$workflow" 'https://*) AUTH_COOKIE_SECURE_VALUE=true' \
  'HTTPS deployments must force Secure authentication cookies'
require_count_at_least "$workflow" '-e AUTH_COOKIE_SECURE="$AUTH_COOKIE_SECURE_VALUE"' 2 \
  'candidate and live frontend must share the scheme-derived cookie policy'
require_text "$workflow" 'FRONTEND_PUBLISH="-p 127.0.0.1:8089:3000"' \
  'HTTPS deployments must not leave the plaintext application port publicly reachable'
require_text "$frontend_dockerfile" 'backfill-classroom-records.mjs' \
  'the immutable frontend image must include the legacy classroom indexer'

# Bash disables errexit inside functions invoked by `if ! function`; exercise
# the exact function extracted from the workflow to ensure each destructive
# migration step propagates failure and never falls through to the copy.
resync_function="$({
  sed -n '/^          resync_named_volume_after_stop() {$/,/^          }$/p' "$workflow" \
    | sed 's/^          //'
})"
if [ -z "$resync_function" ]; then
  echo 'deployment persistence check failed: could not extract final resync function' >&2
  exit 1
fi

if fault_output="$(bash -c '
  eval "$1"
  docker() { printf "false\n"; }
  clear_named_volume_contents() { printf "clear-failed\n"; return 23; }
  copy_container_path_to_volume() { printf "copy-called\n"; return 0; }
  LEGACY_VOLUMES_TO_RESYNC=" moonbot-test "
  resync_named_volume_after_stop moonbot-test old /data helper
' _ "$resync_function" 2>&1)"; then
  echo 'deployment persistence check failed: final resync hid a clear failure' >&2
  exit 1
fi
if printf '%s\n' "$fault_output" | grep -Fq 'copy-called'; then
  echo 'deployment persistence check failed: final resync copied after a clear failure' >&2
  exit 1
fi

if bash -c '
  eval "$1"
  docker() { return 41; }
  clear_named_volume_contents() { return 0; }
  copy_container_path_to_volume() { return 0; }
  LEGACY_VOLUMES_TO_RESYNC=" moonbot-test "
  resync_named_volume_after_stop moonbot-test old /data helper
' _ "$resync_function" >/dev/null 2>&1; then
  echo 'deployment persistence check failed: final resync hid docker inspect failure' >&2
  exit 1
fi
require_text "$workflow" 'resync_named_volume_after_stop moonbot-frontend-data moonbot-frontend /app/data' \
  'frontend legacy data must be synchronized again at the promotion boundary'
require_text "$workflow" 'resync_named_volume_after_stop moonbot-code2video-cases moonbot-code2video /app/CASES' \
  'code2video legacy outputs must be synchronized again at the promotion boundary'
require_text "$workflow" 'resync_named_volume_after_stop moonbot-code2video-tts moonbot-code2video /app/src/tts_static' \
  'code2video legacy TTS files must be synchronized again at the promotion boundary'
require_text "$workflow" 'docker start moonbot-code2video >/dev/null' \
  'a failed final code2video sync must restore the previous live container'
require_text "$workflow" 'final migration of legacy frontend data failed; previous frontend restored' \
  'a failed final frontend sync must restore the previous live container'
require_text "$workflow" 'assert_named_volume_mount moonbot-frontend moonbot-frontend-data /app/data' \
  'deployment must assert the promoted frontend mount'
require_text "$workflow" 'assert_named_volume_mount moonbot-code2video moonbot-code2video-cases /app/CASES' \
  'deployment must assert the promoted code2video mount'
require_text "$workflow" 'assert_named_volume_mount moonbot-code2video moonbot-code2video-tts /app/src/tts_static' \
  'deployment must assert the promoted code2video TTS mount'

require_text "$compose_file" 'moonbot-code2video-cases:/app/CASES' \
  'docker compose must preserve rendered task outputs'
require_text "$compose_file" 'moonbot-code2video-tts:/app/src/tts_static' \
  'docker compose must preserve generated TTS outputs'

echo 'deployment persistence contract OK'
