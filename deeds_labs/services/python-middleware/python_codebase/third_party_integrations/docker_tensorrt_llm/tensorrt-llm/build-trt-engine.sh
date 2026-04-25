#!/usr/bin/env bash
set -euo pipefail

# build-trt-engine.sh
# Wrapper around trtexec with recommended defaults for dynamic shapes.
# Usage: ./build-trt-engine.sh legal_gemma.onnx legal_gemma.plan --max_seq 512

ONNX_PATH=${1:-legal_gemma.onnx}
OUT_PLAN=${2:-legal_gemma.plan}
MAX_SEQ=${3:-512}
OPT_SEQ=${4:-128}
MIN_SEQ=${5:-8}
WORKSPACE_MB=${WORKSPACE_MB:-8192}

echo "Building TensorRT engine"
echo "ONNX: $ONNX_PATH -> PLAN: $OUT_PLAN"

trtexec \
  --onnx=$ONNX_PATH \
  --saveEngine=$OUT_PLAN \
  --fp16 \
  --minShapes=input_ids:1x$MIN_SEQ \
  --optShapes=input_ids:1x$OPT_SEQ \
  --maxShapes=input_ids:4x$MAX_SEQ \
  --workspace=$WORKSPACE_MB \
  --verbose

echo "Done. saved: $OUT_PLAN"
