#!/usr/bin/env bash
set -euo pipefail

ENDPOINT=${TRITON_URL:-http://triton:8000}

if curl -fsS "${ENDPOINT}/v2/health/ready" >/dev/null; then
  exit 0
fi

echo "Triton healthcheck failed against ${ENDPOINT}" >&2
exit 1

