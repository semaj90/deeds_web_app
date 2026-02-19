#!/usr/bin/env bash
# ops/triton/convert_to_triton.sh
# Placeholder script showing steps to export a model (ONNX) and prepare a Triton model repository.
# Fill in real model paths and conversion steps (PyTorch -> ONNX -> TRT -> Triton model dir)

set -euo pipefail

MODEL_NAME=${1:-gemma3}
ONNX_PATH=${2:-./models/${MODEL_NAME}.onnx}
TRITON_MODEL_DIR=${3:-./triton-models/${MODEL_NAME}}

if [ ! -f "$ONNX_PATH" ]; then
  echo "ONNX model not found at $ONNX_PATH"
  exit 2
fi

mkdir -p "${TRITON_MODEL_DIR}/1"
cp "$ONNX_PATH" "${TRITON_MODEL_DIR}/1/model.onnx"

cat > "${TRITON_MODEL_DIR}/config.pbtxt" <<EOF
name: "${MODEL_NAME}"
platform: "onnxruntime_onnx"
max_batch_size: 8
input [
  {
    name: "input__0"
    data_type: TYPE_STRING
    dims: [1]
  }
]
output [
  {
    name: "output__0"
    data_type: TYPE_FP32
    dims: [ -1, 768 ]
  }
]
EOF

echo "Triton model prepared at ${TRITON_MODEL_DIR} (version 1)"

echo "Next: run tritonserver --model-repository=$(realpath triton-models)"
