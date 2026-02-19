#!/usr/bin/env bash
# Start development services for agentic-ai-rag skeleton
set -euo pipefail
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
echo "Starting dev environment in ${ROOT_DIR}"
cd "${ROOT_DIR}/backend/node-api" || exit 1
echo "Installing Node dependencies..."
if [ -f package.json ]; then
  npm install
fi
echo "Starting backend (placeholder: run your actual server)"
# If you have a dev start script, call it; otherwise print a hint
if npm run | grep -q "dev"; then
  npm run dev
else
  echo "No 'dev' script detected in backend/node-api/package.json. Add one or run 'node index.js' manually."
fi
