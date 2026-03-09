#!/bin/bash
# Health check for autoencoder bridge service
# Used by Docker HEALTHCHECK and orchestration tools

set -e

HEALTH_URL="${HEALTH_URL:-http://localhost:8098/health}"
TIMEOUT="${TIMEOUT:-5}"

response=$(curl -sf --max-time "$TIMEOUT" "$HEALTH_URL" 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "OK: $response"
    exit 0
else
    echo "FAIL: Service not responding at $HEALTH_URL"
    exit 1
fi
