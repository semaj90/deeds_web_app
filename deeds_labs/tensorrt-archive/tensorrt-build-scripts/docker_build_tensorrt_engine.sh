#!/usr/bin/env bash
set -euo pipefail

echo "=== TensorRT-LLM Custom Gemma-3 Build ==="

docker exec phase66-tensorrt-llm bash -lc "
  cd /workspace/tensorrt_build &&
  python scripts/verify_custom_shapes.py &&
  python scripts/convert_checkpoint_custom.py \
      input/rank0.safetensors \
      input/custom_build.json \
      custom_ckpt &&
  python custom_model/builder_custom_model.py \
      input/custom_build.json \
      output/engine_fp16
"

echo "=== Build Complete ==="
echo "Engine saved to: tensorrt_build/output/engine_fp16"
