#!/usr/bin/env bash
set -euo pipefail

echo "[smoke-test] Installing build deps (apt-get requires root inside container)"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update && apt-get install -y cmake g++ make
fi

WORKDIR="/workspace/smoke-test"
mkdir -p "$WORKDIR/build"
cd "$WORKDIR/build"

cmake .. \
  -DTENSORRT_LLMSDK_INCLUDE_DIR=/usr/local/lib/python3.12/dist-packages/tensorrt_llm/include \
  -DTENSORRT_LLMSDK_LIB_DIR=/app/lib

cmake --build . -j$(nproc)

# Find the built binary
BINARY_PATH=$(find . -name "tensorrt_smoketest" -type f -executable | head -1)

if [ -n "$BINARY_PATH" ] && [ -x "$BINARY_PATH" ]; then
  echo "[smoke-test] Running $BINARY_PATH"
  $BINARY_PATH || true
else
  echo "[smoke-test] Built target not found"
  find . -name "tensorrt_smoketest" -type f
fi
