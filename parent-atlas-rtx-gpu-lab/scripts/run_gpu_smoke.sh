#!/usr/bin/env bash
set -euo pipefail
python scripts/gpu_preflight.py

echo "Tip: enable zero-code NetworkX GPU dispatch with:"
echo "  export NX_CUGRAPH_AUTOCONFIG=True"
