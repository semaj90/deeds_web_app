#!/usr/bin/env bash
set -euo pipefail

WORKDIR=/work
cd "$WORKDIR"

echo "Atlas Docker entrypoint: workdir=$WORKDIR"

# If /vendor/wheels mounted and not empty, install from there
if [ -d /vendor/wheels ] && ls /vendor/wheels/*.whl >/dev/null 2>&1; then
  echo "Installing vendor wheels from /vendor/wheels"
  python3 -m venv .venv
  . .venv/bin/activate
  python -m pip install --upgrade pip setuptools wheel
  python -m pip install --no-index --find-links=/vendor/wheels numpy xgboost torch || echo "Some vendor wheels missing"
else
  echo "No vendor wheels found; installing minimal deps from PyPI"
  python3 -m venv .venv
  . .venv/bin/activate
  python -m pip install --upgrade pip setuptools wheel
  python -m pip install numpy xgboost
fi

echo "Running atlas phases inside container"
node scripts/atlas/phase17-pytorch-feature-extractor.mjs --input memory/knowledge/schema-indexer-contract-cards.jsonl --out .tmp/phase17-pytorch-features.jsonl --report reports/phase17-pytorch-feature-summary.md
node scripts/atlas/phase18-xgboost-reranker.mjs --input .tmp/phase17-pytorch-features.jsonl --out .tmp/phase18-xgboost-rerank.jsonl --report reports/phase18-xgboost-rerank-summary.md

echo "Atlas phases complete"
