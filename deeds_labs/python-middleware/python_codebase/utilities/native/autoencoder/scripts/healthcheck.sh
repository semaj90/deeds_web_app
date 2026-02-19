#!/usr/bin/env bash
set -euo pipefail

MODE=${1:-}
ARG=${2:-}

fail() {
  echo "[healthcheck] $1" >&2
  exit 1
}

case "$MODE" in
  redis)
    python - <<'PY' || fail "Redis check failed"
import os
from redis import Redis

url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
try:
    client = Redis.from_url(url)
    if not client.ping():
        raise RuntimeError("PING returned false")
except Exception as exc:
    raise SystemExit(f"Redis healthcheck failed: {exc}")
PY
    ;;
  http)
    [[ -n "$ARG" ]] || fail "HTTP mode requires a URL argument"
    curl -fsS "$ARG" >/dev/null || fail "HTTP request to $ARG failed"
    ;;
  analytics-bridge)
    "$(dirname "$0")/healthcheck.sh" redis
    "$(dirname "$0")/healthcheck.sh" http "${ARG:-http://127.0.0.1:8001/health}"
    ;;
  triton)
    "$(dirname "$0")/healthcheck.sh" http "${ARG:-http://127.0.0.1:8000/v2/health/ready}"
    ;;
  *)
    fail "Usage: $(basename "$0") <redis|http|analytics-bridge|triton> [url]"
    ;;
esac

