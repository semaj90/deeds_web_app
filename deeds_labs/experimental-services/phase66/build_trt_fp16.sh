#!/bin/bash
set -e

SRC="/workspace/models/gemma/model_fp16.onnx"
OUT="/workspace/models/gemma/model_fp16.plan"

echo "🚀 Building TensorRT FP16 engine..."

trtexec \
  --onnx=$SRC \
  --saveEngine=$OUT \
  --minShapes=input_ids:1x1 \
  --optShapes=input_ids:1x128 \
  --maxShapes=input_ids:1x512 \
  --fp16 \
  --verbose

echo "🎉 Engine saved to $OUT"