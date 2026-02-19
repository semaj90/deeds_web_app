#!/usr/bin/env bash
# One-way sync from Windows-mounted repo to Linux workspace copy.
# Usage: ./scripts/sync_from_windows.sh /mnt/c/Users/james/Videos/deeds-web-app ~/legal-ai/repo
set -euo pipefail

SRC=${1:-/mnt/c/Users/james/Videos/deeds-web-app}
DST=${2:-$HOME/legal-ai/repo}

if [[ ! -d "$SRC" ]]; then
  echo "Source path not found: $SRC" >&2
  exit 1
fi
mkdir -p "$DST"

echo "Syncing Windows copy -> Linux workspace"
rsync -a --delete --info=progress2 \
  --exclude '.venv/' \
  --exclude 'engines/' \
  --exclude 'node_modules/' \
  --exclude '.git/' \
  "$SRC/" "$DST/"

echo "Done. Consider running: source $DST/.venv/bin/activate && python scripts/verify_build_stack.py"
