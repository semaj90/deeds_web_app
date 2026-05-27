#!/usr/bin/env sh
# Wrapper to set ATLAS_ROOT to the repository root and run the atlas report checker.
# Usage: ./run_check_atlas_root.sh

set -eu

# Resolve script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

# repo root = two levels up from scripts/ci -> ../../..
ATLAS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"

echo "Detected ATLAS_ROOT: $ATLAS_ROOT"

export ATLAS_ROOT

NODE_SCRIPT="$ATLAS_ROOT/sveltekit-frontend/scripts/ci/check_atlas_reports.mjs"

if [ ! -f "$NODE_SCRIPT" ]; then
  echo "Checker not found at $NODE_SCRIPT" 1>&2
  exit 2
fi

echo "Running atlas checker..."
node "$NODE_SCRIPT"
