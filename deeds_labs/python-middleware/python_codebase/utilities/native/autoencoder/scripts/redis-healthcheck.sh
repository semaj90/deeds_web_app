#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
import os
from redis import Redis

url = os.environ.get("REDIS_URL", "redis://redis:6379/0")

try:
    client = Redis.from_url(url)
    if client.ping():
        raise SystemExit(0)
    raise SystemExit(1)
except Exception as exc:
    print(f"Redis healthcheck failed: {exc}", flush=True)
    raise SystemExit(1)
PY

