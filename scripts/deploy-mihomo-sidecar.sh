#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${MIHOMO_ENV_FILE:-/etc/real-time-tutor/proxy.env}"
RUNTIME_DIR="${MIHOMO_RUNTIME_DIR:-/opt/real-time-tutor/runtime/mihomo}"
IMAGE="${MIHOMO_IMAGE:-docker.io/metacubex/mihomo:v1.19.27}"
NETWORK="${MIHOMO_DOCKER_NETWORK:-moonbot-net}"
CONTAINER="${MIHOMO_CONTAINER_NAME:-proxy}"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run this script as root" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: private proxy env is missing: $ENV_FILE" >&2
  exit 1
fi

mode="$(stat -c '%a' "$ENV_FILE")"
if [ "$mode" != "600" ]; then
  echo "ERROR: $ENV_FILE must have mode 600 (current: $mode)" >&2
  exit 1
fi

install -d -m 700 -o root -g root "$RUNTIME_DIR"

# Read the subscription only inside Python so it is never placed in argv,
# shell tracing, Docker metadata, or logs. Preserve the first raw download as a
# private, immutable input and generate a separate minimal runtime config.
MIHOMO_ENV_FILE="$ENV_FILE" MIHOMO_RUNTIME_DIR="$RUNTIME_DIR" python3 <<'PY'
import os
import pathlib
import tempfile
import time
import urllib.error
import urllib.request

import yaml

env_path = pathlib.Path(os.environ["MIHOMO_ENV_FILE"])
runtime_dir = pathlib.Path(os.environ["MIHOMO_RUNTIME_DIR"])

subscription_url = None
for raw_line in env_path.read_text(encoding="utf-8-sig").splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    if key.strip() != "CLASH_SUBSCRIPTION_URL":
        continue
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1]
    if subscription_url is not None:
        raise SystemExit("ERROR: CLASH_SUBSCRIPTION_URL is defined more than once")
    subscription_url = value

if not subscription_url:
    raise SystemExit("ERROR: CLASH_SUBSCRIPTION_URL is missing or empty")

request = urllib.request.Request(
    subscription_url,
    headers={
        "User-Agent": "mihomo/v1.19.27",
        "Accept": "application/yaml,text/yaml,*/*",
    },
)

payload = None
last_error = None
for attempt in range(1, 4):
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = response.read(16 * 1024 * 1024 + 1)
        if len(payload) > 16 * 1024 * 1024:
            raise ValueError("subscription response exceeds 16 MiB")
        break
    except (OSError, ValueError, urllib.error.URLError) as exc:
        last_error = type(exc).__name__
        if attempt < 3:
            time.sleep(attempt * 2)

if payload is None:
    raise SystemExit(f"ERROR: subscription download failed after 3 attempts ({last_error})")

subscription_path = runtime_dir / "subscription.yaml"
runtime_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
if subscription_path.exists():
    payload = subscription_path.read_bytes()
else:
    fd = os.open(subscription_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        subscription_path.unlink(missing_ok=True)
        raise

try:
    subscription = yaml.safe_load(payload.decode("utf-8-sig"))
except (UnicodeDecodeError, yaml.YAMLError) as exc:
    raise SystemExit(f"ERROR: subscription is not valid UTF-8 YAML ({type(exc).__name__})")

if not isinstance(subscription, dict):
    raise SystemExit("ERROR: subscription YAML root must be a mapping")
proxies = subscription.get("proxies")
proxy_providers = subscription.get("proxy-providers")
if not isinstance(proxies, list):
    proxies = []
if not isinstance(proxy_providers, dict):
    proxy_providers = {}
if not proxies and not proxy_providers:
    raise SystemExit("ERROR: subscription YAML contains neither proxies nor proxy-providers")

proxy_names = []
for proxy in proxies:
    if not isinstance(proxy, dict) or not isinstance(proxy.get("name"), str):
        raise SystemExit("ERROR: subscription contains a proxy without a valid name")
    proxy_names.append(proxy["name"])
if len(proxy_names) != len(set(proxy_names)):
    raise SystemExit("ERROR: subscription contains duplicate proxy names")

egress_group = {
    "name": "VERTEX_EGRESS",
    "type": "url-test",
    "url": "https://www.gstatic.com/generate_204",
    "interval": 300,
    "lazy": True,
}
if proxy_names:
    egress_group["proxies"] = proxy_names
if proxy_providers:
    egress_group["use"] = list(proxy_providers)

# Intentionally exclude subscription rules, rule-providers, geox-url, GEOIP,
# GEOSITE, controllers, dashboards, and every unrelated top-level option.
config = {
    "mixed-port": 7890,
    "allow-lan": True,
    "bind-address": "*",
    "authentication": [],
    "mode": "rule",
    "log-level": "silent",
    "ipv6": False,
    "proxies": proxies,
    "proxy-providers": proxy_providers,
    "proxy-groups": [egress_group],
    "rules": [
        "DOMAIN,aiplatform.googleapis.com,VERTEX_EGRESS",
        "DOMAIN-SUFFIX,googleapis.com,VERTEX_EGRESS",
        "MATCH,VERTEX_EGRESS",
    ],
}

fd, temp_name = tempfile.mkstemp(prefix="config.", suffix=".yaml", dir=runtime_dir)
try:
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        yaml.safe_dump(config, stream, allow_unicode=True, sort_keys=False)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temp_name, 0o600)
    os.replace(temp_name, runtime_dir / "config.yaml")
finally:
    if os.path.exists(temp_name):
        os.unlink(temp_name)
PY

chown root:root "$RUNTIME_DIR/config.yaml"
chmod 600 "$RUNTIME_DIR/config.yaml"
chown root:root "$RUNTIME_DIR/subscription.yaml"
chmod 600 "$RUNTIME_DIR/subscription.yaml"

# Remove only public Geo cache artifacts created by earlier failed validation.
rm -f \
  "$RUNTIME_DIR/Country.mmdb" \
  "$RUNTIME_DIR/GeoIP.dat" \
  "$RUNTIME_DIR/GeoSite.dat" \
  "$RUNTIME_DIR/geoip.metadb"

docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null
docker pull "$IMAGE" >/dev/null

# Validate the exact minimal runtime configuration before starting the proxy.
if ! docker run --rm \
  -v "$RUNTIME_DIR:/root/.config/mihomo:rw" \
  "$IMAGE" -t -d /root/.config/mihomo -f /root/.config/mihomo/config.yaml >/dev/null 2>&1; then
  echo "ERROR: Mihomo rejected the minimal runtime configuration" >&2
  exit 1
fi

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network "$NETWORK" \
  --expose 7890 \
  -v "$RUNTIME_DIR:/root/.config/mihomo:rw" \
  "$IMAGE" -d /root/.config/mihomo -f /root/.config/mihomo/config.yaml >/dev/null

proxy_ip="$(docker inspect "$CONTAINER" --format "{{with index .NetworkSettings.Networks \"$NETWORK\"}}{{.IPAddress}}{{end}}")"
for _ in $(seq 1 20); do
  if PROXY_IP="$proxy_ip" python3 -c 'import os, socket; s=socket.create_connection((os.environ["PROXY_IP"], 7890), 1); s.close()' 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! PROXY_IP="$proxy_ip" python3 -c 'import os, socket; s=socket.create_connection((os.environ["PROXY_IP"], 7890), 2); s.close()' 2>/dev/null; then
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  echo "ERROR: Mihomo did not listen on mixed-port 7890" >&2
  exit 1
fi

echo "Mihomo sidecar is running on Docker network $NETWORK (internal port 7890 only)."
