#!/usr/bin/env bash
set -euo pipefail

if command -v conda >/dev/null 2>&1; then
  echo "Conda already installed: $(conda --version)"
else
  echo "Miniforge not detected."
  echo "Install using the current official Miniforge release, then rerun this script."
  exit 2
fi

echo "Existing environments:"
conda env list

echo
echo "If atlas-rapids-cu13 already exists, DO NOT recreate it."
echo "Verify/update packages with env/rapids-26.06-cu13.yml only after comparing versions."
