#!/usr/bin/env bash
# Generate TypeScript types from active .proto files
# Uses pbjs/pbts (protobufjs-cli) — already in devDependencies
#
# Usage: bash scripts/proto-gen.sh

set -euo pipefail

# Resolve absolute path to sveltekit-frontend/
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$FRONTEND_DIR/.." && pwd)"

PROTO_DIR="$REPO_ROOT/proto/active"
OUT_DIR="$FRONTEND_DIR/src/lib/generated/proto"

cd "$FRONTEND_DIR"
mkdir -p "$OUT_DIR"

echo "=== Generating proto types ==="
echo "Proto source: $PROTO_DIR"
echo "Output dir:   $OUT_DIR"

# 1. embedding.proto
echo "[1/4] embedding.proto"
npx pbjs -p "$REPO_ROOT/proto" -p "$PROTO_DIR" -t static-module -w es6 --no-create --no-verify --no-convert \
  -o "$OUT_DIR/embedding_pb.js" "$PROTO_DIR/embedding.proto"
npx pbts -o "$OUT_DIR/embedding_pb.d.ts" "$OUT_DIR/embedding_pb.js"

# 2. retrieval.proto
echo "[2/4] retrieval.proto"
npx pbjs -p "$REPO_ROOT/proto" -p "$PROTO_DIR" -t static-module -w es6 --no-create --no-verify --no-convert \
  -o "$OUT_DIR/retrieval_pb.js" "$PROTO_DIR/retrieval.proto"
npx pbts -o "$OUT_DIR/retrieval_pb.d.ts" "$OUT_DIR/retrieval_pb.js"

# 3. vectors.proto
echo "[3/4] vectors.proto"
npx pbjs -p "$REPO_ROOT/proto" -p "$PROTO_DIR" -t static-module -w es6 --no-create --no-verify --no-convert \
  -o "$OUT_DIR/vectors_pb.js" "$PROTO_DIR/vectors.proto"
npx pbts -o "$OUT_DIR/vectors_pb.d.ts" "$OUT_DIR/vectors_pb.js"

# 4. chr97_agent.proto
echo "[4/5] chr97_agent.proto"
npx pbjs -p "$REPO_ROOT/proto" -p "$PROTO_DIR" -t static-module -w es6 --no-create --no-verify --no-convert \
  -o "$OUT_DIR/chr97_agent_pb.js" "$PROTO_DIR/chr97_agent.proto"
npx pbts -o "$OUT_DIR/chr97_agent_pb.d.ts" "$OUT_DIR/chr97_agent_pb.js"

# 5. turbovec_cuda.proto
echo "[5/5] turbovec_cuda.proto"
npx pbjs -p "$REPO_ROOT/proto" -p "$PROTO_DIR" -t static-module -w es6 --no-create --no-verify --no-convert \
  -o "$OUT_DIR/turbovec_cuda_pb.js" "$PROTO_DIR/turbovec_cuda.proto"
npx pbts -o "$OUT_DIR/turbovec_cuda_pb.d.ts" "$OUT_DIR/turbovec_cuda_pb.js"

echo "=== Done. Output in $OUT_DIR ==="
ls -la "$OUT_DIR"

